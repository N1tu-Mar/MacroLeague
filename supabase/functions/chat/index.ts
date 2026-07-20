// `chat` edge function — MacroCoach AI nutrition advisor.
//
// Receives the user's conversation history, fetches their real profile context
// (goals, streak, today's macros) from the DB, builds a personalized system
// prompt, and returns a reply from the OpenAI Chat Completions API.
//
// The OPENAI_API_KEY secret must be set via:
//   supabase secrets set OPENAI_API_KEY=sk-...
//
// This is the SAME secret the estimate-meal composite parser uses, so one key
// powers both features. OPENAI_MODEL optionally overrides the default model.
//
// Callers must include a valid Supabase Bearer token (handled automatically by
// supabase.functions.invoke on the client side).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeadersFor, preflightResponse, rejectDisallowedOrigin } from '../_shared/cors.ts';
import { consumeQuotas, rateLimitedResponse, type QuotaWindow } from '../_shared/rateLimit.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_TOKENS = 1024;
const MAX_HISTORY = 20;

// Input bounds. MAX_HISTORY alone caps message COUNT, not size — without a
// length cap a caller could send 20 messages of 100KB each and burn ~500K input
// tokens in a single request. These two together bound the input side the same
// way MAX_TOKENS bounds the output side.
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOTAL_CHARS = 12000;
// Reject an oversized body before parsing it at all.
const MAX_BODY_BYTES = 64 * 1024;

// Per-user spend ceilings. The burst window stops a tight retry loop within
// seconds; the daily window bounds total cost per account per day. Both are
// generous relative to real conversational use (a heavy user sends well under
// 100 coach messages a day) and are tunable via function secrets without a
// redeploy of the migration.
function quotaWindows(): QuotaWindow[] {
  const daily = Number(Deno.env.get('CHAT_DAILY_LIMIT') ?? '100');
  const burst = Number(Deno.env.get('CHAT_BURST_LIMIT') ?? '10');
  return [
    {
      bucket: 'chat:burst',
      limit: Number.isFinite(burst) && burst > 0 ? burst : 10,
      windowSeconds: 60,
      label: 'MacroCoach messages this minute',
    },
    {
      bucket: 'chat:daily',
      limit: Number.isFinite(daily) && daily > 0 ? daily : 100,
      windowSeconds: 86400,
      label: 'MacroCoach messages today',
    },
  ];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return preflightResponse(req);
  // Enforce the origin allow-list before ANY work — a blocked response is not
  // enough on an endpoint that spends money (see _shared/cors.ts).
  const originRejection = rejectDisallowedOrigin(req);
  if (originRejection) return originRejection;
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  // Cheapest possible rejection of an oversized payload: trust the declared
  // length first, and re-check the real size after reading (below).
  const declaredLength = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'Message is too long.' }, 413);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') || DEFAULT_MODEL;

  if (!supabaseUrl || !serviceRoleKey) return json({ error: 'Missing Supabase config.' }, 500);
  if (!openaiKey) return json({ error: 'MacroCoach is not configured yet.' }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Auth check — only logged-in users can access the coach.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Not authenticated.' }, 401);
  const userId = authData.user.id;

  const rawBody = await req.text();
  // Authoritative size check — Content-Length is client-supplied and may lie.
  if (new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return json({ error: 'Message is too long.' }, 413);
  }

  let body: { messages?: unknown };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const messages: ChatMessage[] = rawMessages
    .filter(
      (m): m is ChatMessage =>
        m !== null &&
        typeof m === 'object' &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY)
    // Truncate rather than reject: a long paste should still get an answer,
    // just a bounded one. The newest message is the one the user is asking
    // about, so trimming the tail of each turn is the least surprising cut.
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return json({ error: 'Last message must be from the user.' }, 400);
  }

  // Belt-and-braces on aggregate size: drop the OLDEST turns until the whole
  // history fits. The final user message is always preserved.
  let totalChars = messages.reduce((n, m) => n + m.content.length, 0);
  while (messages.length > 1 && totalChars > MAX_TOTAL_CHARS) {
    totalChars -= messages[0].content.length;
    messages.shift();
  }

  // Consume quota AFTER validation but BEFORE any paid work. Ordering matters:
  // charging before validation would let a client bug (or a malformed retry
  // loop) burn a real user's daily budget on requests that never reach OpenAI,
  // while charging after the call would not bound spend at all. Body parsing is
  // bounded by MAX_BODY_BYTES, so doing it first is cheap.
  const quota = await consumeQuotas(admin, userId, quotaWindows());
  if (!quota.allowed) return rateLimitedResponse(quota, corsHeaders);

  // Fetch user context in parallel — non-fatal if either fails.
  const today = new Date().toISOString().slice(0, 10);
  const [profileRes, mealsRes] = await Promise.allSettled([
    admin
      .from('profiles')
      .select(
        'display_name, username, goal_calories, goal_protein_g, goal_carbs_g, goal_unsaturated_fat_g, xp, streak_count, points',
      )
      .eq('id', userId)
      .single(),
    admin
      .from('meal_logs')
      .select('calories, protein_g, carbs_g, fat_g, free_text')
      .eq('user_id', userId)
      .gte('eaten_at', today)
      .limit(20),
  ]);

  const profile = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
  const meals = mealsRes.status === 'fulfilled' ? (mealsRes.value.data ?? []) : [];

  const name =
    profile?.display_name && !profile.display_name.startsWith('user_')
      ? profile.display_name
      : 'Athlete';
  const level = profile ? Math.floor((profile.xp ?? 0) / 500) + 1 : 1;
  const streak = profile?.streak_count ?? 0;
  const points = profile?.points ?? 0;

  // deno-lint-ignore no-explicit-any
  const todayCal = meals.reduce((s: number, m: any) => s + (m.calories ?? 0), 0);
  // deno-lint-ignore no-explicit-any
  const todayPro = meals.reduce((s: number, m: any) => s + (m.protein_g ?? 0), 0);
  // deno-lint-ignore no-explicit-any
  const todayCarb = meals.reduce((s: number, m: any) => s + (m.carbs_g ?? 0), 0);
  const mealCount = meals.length;

  const goalCal = profile?.goal_calories ?? null;
  const goalPro = profile?.goal_protein_g ?? null;
  const goalCarb = profile?.goal_carbs_g ?? null;
  const goalUnsat = profile?.goal_unsaturated_fat_g ?? null;

  const fmt = (n: number) => Math.round(n).toString();
  const fmtGoal = (v: number | null) => (v !== null ? fmt(v) : 'not set');

  const systemPrompt = `You are MacroCoach — the built-in AI nutrition coach for MacroLeague, a gamified macro tracking app for student athletes and fitness-focused university students.

USER PROFILE:
• Name: ${name}
• Level: ${level} (${profile?.xp ?? 0} XP total)
• Current streak: ${streak} day${streak !== 1 ? 's' : ''}
• Points balance: ${points.toLocaleString()}

TODAY'S PROGRESS (${today}):
• Meals logged: ${mealCount}
• Calories: ${fmt(todayCal)} / ${fmtGoal(goalCal)} kcal
• Protein: ${fmt(todayPro)}g / ${fmtGoal(goalPro)}g
• Carbs: ${fmt(todayCarb)}g / ${fmtGoal(goalCarb)}g
• Unsaturated fat target: ${fmtGoal(goalUnsat)}g

YOUR ROLE:
You are a knowledgeable, encouraging nutrition coach with deep expertise in sports nutrition and exercise science. Your job is to:

1. Explain macronutrients (protein, carbs, fats), micronutrients, fiber, vitamins, and minerals with scientific backing — specifically how each affects athletic performance, muscle building, body composition, energy, and recovery.
2. Answer questions about specific nutrients: e.g., why trans fats are harmful (inflammation, LDL increase, HDL decrease), how unsaturated fats support cell membranes and hormone production, why fiber aids digestion and satiety, how sodium affects hydration and muscle function.
3. Give practical, actionable advice tied to the user's real goals (protein: ${fmtGoal(goalPro)}g, calories: ${fmtGoal(goalCal)} kcal).
4. Personalize responses using their data — e.g., "You've hit ${fmt(todayPro)}g of protein today, ${goalPro ? Math.max(0, goalPro - Math.round(todayPro)) + 'g to go' : 'keep it up'}."
5. Celebrate wins: streak progress, goal hits, level achievements.
6. Teach sustainable habits that build long-term nutrition literacy, not just short-term compliance.
7. Explain the science behind the app's gamification (why hitting protein and macro accuracy goals earns more points).

EVIDENCE STANDARDS:
- Cite well-established nutritional science: "Research consistently shows...", "Meta-analyses indicate...", "The scientific consensus is..."
- Use phrases like "emerging research suggests" for newer findings
- Never fabricate specific study citations or authors
- Distinguish between strong evidence (trans fats → CVD risk) and areas of ongoing debate (optimal protein timing)

COMMUNICATION STYLE:
- Warm, direct, never preachy or condescending
- Concise: 2–4 sentences for simple questions; structured (use line breaks, not bullet lists) for complex ones
- Use analogies athletes relate to (energy systems, muscle repair, fuel vs. structure)
- Don't repeat "As your MacroCoach" or similar phrases — just be natural

HARD LIMITS:
- For medical conditions, eating disorders, or clinical nutrition: recommend consulting a registered dietitian
- Do not diagnose or prescribe for specific health conditions
- No pseudoscience, detox claims, or unsupported supplement recommendations`;

  // Call OpenAI Chat Completions API. The system prompt is the first message;
  // the rest is the user/assistant turn history.
  let openaiResponse: Response;
  try {
    openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        // Authorization is intentionally never logged anywhere.
        Authorization: `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
      }),
    });
  } catch {
    return json({ error: 'Failed to reach the AI service. Check your connection.' }, 502);
  }

  if (!openaiResponse.ok) {
    // Log the provider's status + error code to the server logs ONLY (never
    // returned to the client, which could echo the request or leak provider
    // internals / billing state). Read just the error code/message for the log.
    let detail = '';
    try {
      const body = await openaiResponse.json();
      detail = body?.error?.code || body?.error?.message || '';
    } catch {
      // ignore — body may be empty or non-JSON
    }
    console.error('[chat] OpenAI error', openaiResponse.status, detail);
    // The client always gets a generic, safe message.
    return json({ error: 'AI service returned an error. Please try again.' }, 502);
  }

  // deno-lint-ignore no-explicit-any
  const result: any = await openaiResponse.json();
  const reply: string = result?.choices?.[0]?.message?.content ?? '';

  if (!reply) return json({ error: 'AI returned an empty response.' }, 502);

  return json({ reply });
});

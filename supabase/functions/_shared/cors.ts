// Shared CORS handling for browser (Expo web) callers.
//
// Previously this exported a static `Access-Control-Allow-Origin: *`, which let
// ANY web page invoke these functions cross-origin — including
// `account-lifecycle`, which deactivates accounts. A bearer token is still
// required, so `*` was not by itself an auth hole, but it removed the origin
// barrier from the exact endpoints that spend money, and it makes a leaked or
// borrowed token usable from an attacker-controlled page.
//
// Origins are now allow-listed via the ALLOWED_ORIGINS function secret
// (comma-separated), e.g.
//
//   supabase secrets set ALLOWED_ORIGINS="https://macroleague.app,http://localhost:8081"
//
// NATIVE CALLERS ARE UNAFFECTED: React Native does not send an Origin header and
// does not enforce CORS. Only browsers are gated here, so a misconfigured
// allow-list degrades the web build, never the iOS/Android apps.

const DEFAULT_ALLOWED_ORIGINS = [
  'https://macroleague.app',
  'https://www.macroleague.app',
  // Expo web dev server defaults.
  'http://localhost:8081',
  'http://localhost:19006',
];

// An entry may contain a single `*`, which matches one or more characters
// WITHIN a hostname label — never across a dot. This exists for hosts that mint
// rotating preview URLs (Vercel: `<project>-<hash>-<team>.vercel.app`), which
// exact matching cannot cover.
//
// Scope these tightly. `https://macroleague-*.vercel.app` allows only this
// project's previews; a bare `https://*.vercel.app` would allow ANY page on
// vercel.app — and anyone can deploy there for free, so that is barely narrower
// than the wildcard this module exists to remove.
//
// `*` is deliberately NOT allowed to match a dot: without that rule,
// `https://macroleague-*.vercel.app` would also match
// `https://macroleague-x.evil.com.vercel.app.attacker.net`-style hostnames.
export function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // [^.]+ — one or more chars, no dots, so a wildcard stays inside one label.
    .join('[^.]+');
  return new RegExp(`^${escaped}$`);
}

// Parsed once per isolate, not per request — the env cannot change under a
// running instance, and this sits on the hot path of every call.
const { exact: ALLOWED, patterns: ALLOWED_PATTERNS } = (() => {
  const raw = Deno.env.get('ALLOWED_ORIGINS');
  const list = raw
    ? raw
        .split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter((o) => o.length > 0)
    : [];
  const entries = list.length > 0 ? list : DEFAULT_ALLOWED_ORIGINS;

  return {
    exact: new Set(entries.filter((e) => !e.includes('*'))),
    patterns: entries.filter((e) => e.includes('*')).map(patternToRegExp),
  };
})();

function isAllowedOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/+$/, '');
  if (ALLOWED.has(normalized)) return true;
  return ALLOWED_PATTERNS.some((re) => re.test(normalized));
}

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  // Responses differ per Origin — never let a shared cache serve one origin's
  // response to another.
  Vary: 'Origin',
};

/**
 * CORS headers for a specific request.
 *
 * - No Origin header (native app, curl, server-to-server): no ACAO is emitted.
 *   Nothing to relax — CORS is a browser-only concept.
 * - Allow-listed Origin: echoed back exactly.
 * - Any other Origin: no ACAO, so the browser blocks the response.
 */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin');
  if (!origin) return { ...BASE_HEADERS };

  if (isAllowedOrigin(origin)) {
    return { ...BASE_HEADERS, 'Access-Control-Allow-Origin': origin.replace(/\/+$/, '') };
  }
  return { ...BASE_HEADERS };
}

/**
 * Reject a cross-origin request outright, or null to continue.
 *
 * WHY THIS EXISTS: withholding Access-Control-Allow-Origin only stops the
 * browser from *reading* the response — the request still reached us and the
 * handler still ran. On endpoints that spend money (OpenAI/USDA) or mutate
 * account state, an attacker's page could therefore still trigger the work and
 * simply not see the result. Refusing before any handler logic is what actually
 * closes that, so origin checking is enforcement here, not just a header.
 *
 * Returns null for requests with NO Origin header — native iOS/Android, curl,
 * and server-to-server callers never send one, and CORS does not apply to them.
 * Those paths are protected by the bearer-token auth check instead.
 */
export function rejectDisallowedOrigin(req: Request): Response | null {
  const origin = req.headers.get('Origin');
  if (!origin || isAllowedOrigin(origin)) return null;

  console.warn('[cors] blocked cross-origin request from', origin);
  return new Response(JSON.stringify({ error: 'Origin not allowed.' }), {
    status: 403,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Standard preflight response for a request. */
export function preflightResponse(req: Request): Response {
  return new Response('ok', { headers: corsHeadersFor(req) });
}

/**
 * Back-compat export. Kept so any not-yet-migrated call site still compiles, but
 * it carries NO Access-Control-Allow-Origin — prefer corsHeadersFor(req).
 */
export const corsHeaders: Record<string, string> = { ...BASE_HEADERS };

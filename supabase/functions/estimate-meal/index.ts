// `estimate-meal` edge function.
//
// Flow:
//   Expo app -> estimate-meal -> USDA FoodData Central -> Supabase cache -> app
//
// Two candidate kinds are returned (both editable, never auto-saved):
//   - 'direct'    : the existing whole-query USDA search (always present; this is
//                   also the fallback whenever composite parsing is unavailable).
//   - 'composite' : an optional summed estimate for multi-item descriptions, built
//                   only when OPENAI_API_KEY is configured (see parser.ts). The
//                   language model only extracts ingredient structure; ALL macro
//                   numbers still come from USDA.
//
// The USDA + OpenAI keys live ONLY here as function secrets and are never logged
// or returned to the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';
import { normalizeQuery, round, searchUsda } from './usda.ts';
import { searchOpenFoodFacts } from './openFoodFacts.ts';
import { type SourceCandidate } from './shared.ts';
import { createParser, validateParsedMeal, type ParsedMeal } from './parser.ts';
import { buildComposite, type ComponentEstimate, type ResolvedFood } from './composite.ts';

/** A source's search function: given a normalized query + page size, returns
 *  candidates. Lets resolveCandidates stay identical for every provider. */
type SearchFn = (normalizedQuery: string, pageSize: number) => Promise<SourceCandidate[]>;

const CACHE_TTL_DAYS = 7;
const DEFAULT_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 10;
// Smaller per-component search; we only use the top hit for each ingredient.
const COMPONENT_PAGE_SIZE = 4;
// Bound input so a normalized cache key stays under the 200-char column limit
// (with the "parse::" prefix) and a hostile description can't fan out forever.
const MAX_QUERY_LEN = 180;
const PARSE_CACHE_PREFIX = 'parse::';

interface EstimateCandidate extends Omit<SourceCandidate, 'rawPayload'> {
  foodId: string | null;
  // --- Additive composite fields (optional; older clients ignore them). ---
  kind?: 'direct' | 'composite';
  originalQuery?: string;
  components?: ComponentEstimate[];
  assumptions?: string[];
  warnings?: string[];
  confidenceRange?: { low: number; high: number } | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const usdaApiKey = Deno.env.get('USDA_FDC_API_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server is missing Supabase configuration.' }, 500);
  }
  if (!usdaApiKey) {
    return json({ error: 'Server is missing USDA_FDC_API_KEY.' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Require an authenticated caller — users may only reach USDA through this gate.
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return json({ error: 'Not authenticated.' }, 401);
  }

  let payload: { query?: unknown; pageSize?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const rawQuery = typeof payload.query === 'string' ? payload.query.slice(0, MAX_QUERY_LEN) : '';
  const normalized = normalizeQuery(rawQuery);
  if (normalized.length < 2) {
    return json({ error: 'Please describe your meal in at least 2 characters.' }, 400);
  }

  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(payload.pageSize) || DEFAULT_PAGE_SIZE),
  );

  // Resolve nutrition source rows. usda_fdc is required (existing behavior);
  // open_food_facts is optional — if its row isn't there yet (e.g. the
  // migration hasn't reached this environment), OFF is silently skipped and
  // the USDA path proceeds exactly as before.
  const { data: sources, error: sourceError } = await admin
    .from('nutrition_sources')
    .select('id, key')
    .in('key', ['usda_fdc', 'open_food_facts']);

  const usdaSourceId = (sources ?? []).find((s: { key: string }) => s.key === 'usda_fdc')?.id as
    | string
    | undefined;
  const offSourceId = (sources ?? []).find((s: { key: string }) => s.key === 'open_food_facts')?.id as
    | string
    | undefined;

  if (sourceError || !usdaSourceId) {
    return json({ error: 'usda_fdc nutrition source is not configured.' }, 500);
  }

  const usdaSearch: SearchFn = (q, n) => searchUsda(usdaApiKey, q, n);

  // 1. DIRECT candidates (whole-query search). USDA is required — a failure
  //    here still fails the request, same as before. Open Food Facts is
  //    additive and best-effort: Promise.allSettled means a rate-limit, network
  //    blip, or missing source row there can never break the USDA path.
  const [usdaResult, offResult] = await Promise.allSettled([
    resolveCandidates(admin, usdaSourceId, normalized, rawQuery, pageSize, usdaSearch),
    offSourceId
      ? resolveCandidates(admin, offSourceId, normalized, rawQuery, pageSize, searchOpenFoodFacts)
      : Promise.resolve(null),
  ]);

  if (usdaResult.status === 'rejected') {
    return json({ error: (usdaResult.reason as Error).message }, 502);
  }
  const direct = usdaResult.value;

  let offCandidates: EstimateCandidate[] = [];
  if (offResult.status === 'fulfilled' && offResult.value) {
    offCandidates = offResult.value.candidates;
  } else if (offResult.status === 'rejected') {
    console.error('[estimate-meal] Open Food Facts search failed', (offResult.reason as Error)?.message);
  }

  // Cap the merged list at the requested pageSize, USDA first — so a caller
  // asking for N candidates still gets at most N, and existing USDA-only
  // behavior is unchanged whenever USDA alone already fills every slot.
  const directCandidates = [...direct.candidates, ...offCandidates]
    .slice(0, pageSize)
    .map((c) => ({ ...c, kind: 'direct' as const }));

  // 2. COMPOSITE candidate (optional). Any failure here is swallowed so the user
  //    still gets the direct candidates — composite is purely additive.
  const compositeCandidates: EstimateCandidate[] = [];
  const parser = createParser();
  if (parser) {
    try {
      const parsed = await getOrParse(admin, usdaSourceId, normalized, rawQuery, parser);
      if (parsed && parsed.isComposite && parsed.components.length >= 2) {
        const composite = await buildComposite(parsed, async (name): Promise<ResolvedFood | null> => {
          const componentQuery = normalizeQuery(name);
          // Too short to search meaningfully → treat as unmatched (no USDA call).
          if (componentQuery.length < 2) {
            return null;
          }
          // Composite ingredient resolution stays USDA-only: parsed components
          // are generic ingredients ("2 eggs", "1 cup rice"), which USDA's
          // Foundation/SR Legacy data already covers well, and doubling calls
          // out to Open Food Facts per ingredient isn't worth it here.
          const resolved = await resolveCandidates(
            admin,
            usdaSourceId,
            componentQuery,
            name,
            COMPONENT_PAGE_SIZE,
            usdaSearch,
          );
          const top = resolved.candidates[0];
          if (!top) return null;
          return {
            externalId: top.externalId,
            foodId: top.foodId,
            name: top.name,
            per100g: top.per100g,
            servingGramWeight: top.servingGramWeight,
            confidence: top.confidence,
          };
        });

        if (composite) {
          compositeCandidates.push({
            source: 'usda_fdc',
            kind: 'composite',
            // Synthetic id — a composite isn't a single cached food.
            externalId: `composite::${normalized}`,
            foodId: null,
            name: rawQuery,
            brandName: null,
            dataType: 'Composite estimate',
            servingDescription: `${round(composite.totalGrams)} g total`,
            servingGramWeight: round(composite.totalGrams),
            confidence: composite.confidence,
            serving: composite.summed,
            per100g: composite.per100g,
            originalQuery: rawQuery,
            components: composite.components,
            assumptions: composite.assumptions,
            warnings: composite.warnings,
            confidenceRange: composite.confidenceRange,
          });
        }
      }
    } catch (err) {
      // Parser/compose failure → fall back to direct candidates only.
      console.error('[estimate-meal] composite path failed', (err as Error)?.name ?? 'error');
    }
  }

  // Composite first (when present), then the direct matches.
  const candidates = [...compositeCandidates, ...directCandidates];

  return json({
    query: rawQuery,
    normalizedQuery: normalized,
    source: 'usda_fdc',
    cached: direct.cached,
    candidates,
  });
});

/**
 * Cache-or-search for one normalized query against one provider: returns mapped
 * candidates (each with its cached `foods.id`) and whether the result came from
 * the search cache. `search` is injected so this same function backs USDA, Open
 * Food Facts, and each composite component — repeated queries reuse the cache
 * and the live-provider call count stays bounded, regardless of source.
 */
async function resolveCandidates(
  // deno-lint-ignore no-explicit-any
  admin: any,
  sourceId: string,
  normalized: string,
  rawQuery: string,
  pageSize: number,
  search: SearchFn,
): Promise<{ candidates: EstimateCandidate[]; cached: boolean }> {
  // 1. Cache hit?
  const { data: cached } = await admin
    .from('food_search_cache')
    .select('results, expires_at')
    .eq('source_id', sourceId)
    .eq('normalized_query', normalized)
    .maybeSingle();

  if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
    return { candidates: cached.results as EstimateCandidate[], cached: true };
  }

  // 2. Query the provider on demand.
  const found = await search(normalized, pageSize);

  // 3. Cache each candidate food into `foods` (once per source+external_id).
  const externalIds = found.map((c) => c.externalId);
  const idByExternal = new Map<string, string>();

  if (externalIds.length > 0) {
    const { data: existing } = await admin
      .from('foods')
      .select('id, external_id')
      .eq('source_id', sourceId)
      .in('external_id', externalIds);

    for (const row of existing ?? []) {
      idByExternal.set(row.external_id as string, row.id as string);
    }

    const missing = found.filter((c) => !idByExternal.has(c.externalId));
    if (missing.length > 0) {
      const now = new Date().toISOString();
      const rows = missing.map((c) => ({
        source_id: sourceId,
        external_id: c.externalId,
        created_by: null,
        // foods.name has a 1-120 char check; USDA descriptions can be longer.
        name: c.name.slice(0, 120),
        brand_name: c.brandName,
        data_type: c.dataType,
        serving_desc: c.servingDescription,
        serving_size: c.servingGramWeight,
        serving_unit: 'g',
        // Legacy not-null columns hold the per-serving snapshot.
        calories: c.serving.calories,
        protein_g: c.serving.proteinG,
        carbs_g: c.serving.carbsG,
        fat_g: c.serving.fatG,
        calories_per_100g: c.per100g.calories,
        protein_g_per_100g: c.per100g.proteinG,
        carbs_g_per_100g: c.per100g.carbsG,
        fat_g_per_100g: c.per100g.fatG,
        saturated_fat_g_per_100g: c.per100g.saturatedFatG,
        trans_fat_g_per_100g: c.per100g.transFatG,
        unsaturated_fat_g_per_100g: c.per100g.unsaturatedFatG,
        fiber_g_per_100g: c.per100g.fiberG,
        sodium_mg_per_100g: c.per100g.sodiumMg,
        raw_payload: c.rawPayload,
        cached_at: now,
        updated_at: now,
      }));

      const { data: inserted } = await admin
        .from('foods')
        .insert(rows)
        .select('id, external_id');

      for (const row of inserted ?? []) {
        idByExternal.set(row.external_id as string, row.id as string);
      }
    }
  }

  const candidates: EstimateCandidate[] = found.map((c) => ({
    source: c.source,
    externalId: c.externalId,
    foodId: idByExternal.get(c.externalId) ?? null,
    name: c.name,
    brandName: c.brandName,
    dataType: c.dataType,
    servingDescription: c.servingDescription,
    servingGramWeight: c.servingGramWeight,
    confidence: c.confidence,
    serving: c.serving,
    per100g: c.per100g,
  }));

  // 4. Write/refresh the search cache.
  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000).toISOString();
  await admin
    .from('food_search_cache')
    .upsert(
      {
        source_id: sourceId,
        normalized_query: normalized,
        raw_query: rawQuery,
        results: candidates,
        expires_at: expiresAt,
      },
      { onConflict: 'source_id,normalized_query' },
    );

  return { candidates, cached: false };
}

/**
 * Returns a cached parse if present and unexpired, otherwise calls the parser and
 * caches the (non-sensitive, normalized) result. Reuses `food_search_cache` under
 * a "parse::" key namespace so no new table/migration is required. Cache failures
 * are non-fatal — parsing still proceeds.
 */
async function getOrParse(
  // deno-lint-ignore no-explicit-any
  admin: any,
  sourceId: string,
  normalized: string,
  query: string,
  parser: { parse: (q: string) => Promise<ParsedMeal | null> },
): Promise<ParsedMeal | null> {
  const cacheKey = (PARSE_CACHE_PREFIX + normalized).slice(0, 200);

  try {
    const { data } = await admin
      .from('food_search_cache')
      .select('results, expires_at')
      .eq('source_id', sourceId)
      .eq('normalized_query', cacheKey)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      const cachedParsed = validateParsedMeal(data.results);
      if (cachedParsed) {
        return cachedParsed;
      }
    }
  } catch {
    // Ignore cache-read problems and parse fresh.
  }

  const parsed = await parser.parse(query);
  if (!parsed) {
    return null;
  }

  try {
    const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000).toISOString();
    await admin.from('food_search_cache').upsert(
      {
        source_id: sourceId,
        normalized_query: cacheKey,
        raw_query: query.slice(0, 200),
        results: parsed,
        expires_at: expiresAt,
      },
      { onConflict: 'source_id,normalized_query' },
    );
  } catch {
    // Non-fatal: a missing cache write just means we may re-parse next time.
  }

  return parsed;
}

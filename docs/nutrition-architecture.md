# MacroLeague Nutrition Architecture (Phase 1)

This document describes the first version of MacroLeague's food-nutrition
architecture: the on-demand USDA lookup, the local cache, and the
natural-language "Describe your meal" flow. It is intentionally an **estimate +
user-correction** design, not a perfect parser.

## Goals

Let a user type a free-text meal (e.g. `"grilled chicken breast with broccoli"`),
get estimated macros from a trustworthy nutrition source, and **confirm/edit**
those macros before the meal is saved to `meal_logs`. The previous manual-entry
path is preserved and untouched.

## Request flow

```
Expo app
  └─ src/services/nutrition/mealEstimateService.ts  (estimateMeal)
       └─ supabase.functions.invoke('estimate-meal')      ← user JWT
            └─ supabase/functions/estimate-meal/index.ts   (service role)
                 ├─ check food_search_cache (by normalized query)
                 ├─ on miss → USDA FoodData Central /foods/search   ← USDA_FDC_API_KEY
                 ├─ map nutrients → cache foods rows + food_search_cache
                 └─ return candidates
       ← candidates (each editable)
  └─ user taps "Use & Edit" → fields populate → user edits → SAVE MEAL
       └─ logMeal(... source: 'user_estimate', sourceFoodId, fat breakdown ...)
            └─ meal_logs row (snapshot, user_confirmed_at set)
```

The Expo client **never** calls USDA directly and never reads the cache tables
directly. Everything external goes through the edge function.

## Why USDA FoodData Central is foundational

- **Public domain.** FDC data is a U.S. Government work, so we can cache and
  redisplay it without license friction.
- **Breadth + quality.** Foundation, SR Legacy, and Survey (FNDDS) cover whole
  foods and common prepared dishes with per-100g nutrient detail, including the
  separate fat types (saturated / trans / mono / poly) the app now tracks.
- **Stable identifiers.** Each food has an `fdcId`, so we cache each source food
  exactly once (`foods.external_id` + the `foods_source_external_id` unique
  index).

## Why Open Food Facts is deferred

Open Food Facts is best for **packaged/barcoded** products (brand SKUs, scanned
labels). That is a later milestone (barcode scanning) and a different data
shape. The schema already supports it: add a `nutrition_sources` row with key
`open_food_facts` and reuse the same `foods` / `food_search_cache` tables. No
migration change is required to start using it.

## Why user-confirmed foods are cached

- **Cost + rate limits.** USDA issues per-key rate limits. Caching search
  responses (`food_search_cache`, 7-day TTL) and the mapped foods (`foods`)
  means repeat lookups for the same query skip the external API entirely.
- **Stable references.** A cached `foods` row gives each estimate a durable
  `foodId` that a meal log can point at via `meal_logs.source_food_id`.
- **History integrity.** `meal_logs` still snapshots the macro values at insert
  time (existing behavior), so re-mapping or re-caching a food never rewrites a
  user's logged history.

## Limitations of USDA for natural-language composite meals

USDA search matches **single foods**, not composite dishes. For
`"pizza with pineapples and ham"`:

- The search returns whole-food / dish candidates that match the keywords
  (e.g. a "Hawaiian pizza" entry, or "pizza, cheese"), ranked by USDA relevance.
- It does **not** decompose the sentence into pizza + pineapple + ham and sum
  them. The user picks the closest candidate and edits the macros.

Queries that map well today: single foods and simple dishes —
`"grilled chicken breast"`, `"kraft macaroni and cheese"`, `"margherita pizza"`.
Queries that stay approximate: multi-ingredient plates —
`"steak and broccoli, celery, carrots, mashed potatoes"`,
`"2 eggs and toast"` (quantities are not parsed yet).

Documented next steps for better composite handling (not built in Phase 1):

- Ingredient decomposition (split the text, search each ingredient, sum).
- OpenAI-assisted parsing inside the edge function (key stays server-side).
- A Nutritionix-style natural-language nutrition API.
- Custom campus/dining-hall foods.

## Composite meal descriptions (Phase 2)

Multi-item descriptions (`"2 eggs and toast"`, `"steak and broccoli, carrots"`)
are handled by an **optional** composite path layered on top of the existing
whole-query USDA search. The whole-query path is unchanged and is always the
fallback.

**Architecture chosen:** a provider-independent parser interface
(`estimate-meal/parser.ts`) with a single optional implementation (OpenAI) that
is created only when `OPENAI_API_KEY` is present. This combines the two options
in the brief: the interface + whole-query fallback gives clean degradation, and
the LLM parser adds real decomposition when configured.

```
description
  └─ estimate-meal (authenticated)
       ├─ DIRECT: whole-query USDA search (always; also the fallback)   ← existing
       └─ COMPOSITE (only if OPENAI_API_KEY set):
            ├─ parser.parse(query) → { isComposite, components[], warnings }   ← OpenAI, strict JSON
            │     (model returns INGREDIENT STRUCTURE ONLY — no macros)
            ├─ for each component → USDA search (reuses food/search caches)
            ├─ deterministic gram scaling + summing of USDA nutrients (composite.ts)
            └─ composite candidate { components, assumptions, warnings, confidenceRange }
  ← candidates: [composite?, ...direct]   (all editable drafts; never auto-saved)
```

Key guarantees:

- **USDA is the only source of macro numbers.** The model never returns
  calories/protein/carbs/fat; the strict `json_schema` has no nutrition fields
  and every field is re-validated server-side (`validateParsedMeal`).
- **Single dishes stay whole.** The prompt instructs the model to keep
  `"macaroni and cheese"`, `"chicken pot pie"`, etc. as one component
  (`isComposite=false`), so they are not wrongly split.
- **No silent zeros.** A component with no USDA match contributes nothing and is
  surfaced as a warning; the estimate is explicitly partial.
- **Honest fat subtypes.** A composite fat subtype is summed only when every
  contributing component reports it; otherwise it stays null (unknown).
- **Graceful fallback at every step.** Missing key, parse timeout, invalid JSON,
  or zero matched components → the user still gets the direct candidates.
- **Bounded + safe.** Input is capped at 180 chars; components capped at 8;
  per-component grams clamped; per-component USDA `pageSize` is small; parse
  results are cached (7-day TTL) and reuse the existing `food_search_cache` under
  a `parse::` key namespace (no new table/migration needed). Keys and auth
  headers are never logged.
- **Saving is unchanged.** A confirmed composite draft saves through the same
  `logMeal()` → `meal_logs` path as everything else (`source = 'user_estimate'`).

## Where API keys live

- `USDA_FDC_API_KEY` is a **Supabase function secret**, read via
  `Deno.env.get('USDA_FDC_API_KEY')` inside the edge function only. It is never
  imported into `src/` and never shipped in the Expo bundle.
- `SUPABASE_SERVICE_ROLE_KEY` is auto-injected into the edge runtime and used
  only server-side to write the cache / foods rows (bypassing RLS).
- The Expo app only holds the public `EXPO_PUBLIC_SUPABASE_URL` and anon key.

## Data model (migration `0003_nutrition_architecture.sql`)

All changes are additive and backwards-compatible.

| Object | Purpose |
| --- | --- |
| `nutrition_sources` | Reference list of sources. Seeded: `usda_fdc`, `manual`, `user_estimate`. |
| `foods` (expanded) | Adds `source_id`, `external_id`, `brand_name`, `data_type`, serving info, `*_per_100g` nutrients, `raw_payload` JSONB, `cached_at`. Original not-null macro columns kept = manual path unchanged. |
| `food_portions` | Household serving sizes (USDA foodPortions) for future per-portion scaling. |
| `food_search_cache` | Raw provider search responses keyed by normalized query, with `expires_at`. Server-only (no client RLS policy). |
| `meal_logs` (expanded) | Adds `source`, `source_food_id`, `confidence`, `saturated_fat_g`, `trans_fat_g`, `unsaturated_fat_g`, `fiber_g`, `sodium_mg`, `user_confirmed_at`. Existing total `fat_g` preserved. |

### RLS summary

- `nutrition_sources`, `food_portions`: public **read**, writes only via service role.
- `food_search_cache`: **no** client policy — only the edge function (service role) touches it.
- `foods`: existing read-all / insert-own policies kept; USDA rows are inserted by the service role with `created_by = null`.

## Meal-logging stabilization (Phase 1.1)

This pass hardened the shared logging foundation without expanding parsing. Key
decisions a future reviewer should know:

- **One save path.** Both manual and assisted entry build the same editable
  draft in `useMealLogger` and save through `logMeal()` → `meal_logs`. There is
  no second table or insert path. Assisted estimates are never auto-saved.
- **Fat model is explicit.** `meal_logs.fat_g` is **total fat**. Saturated,
  trans, and unsaturated are separate nullable columns. The UI never relabels
  total fat as unsaturated.
- **No stale hidden breakdown.** The USDA fat subtypes populate **visible,
  editable** form fields (not a hidden ref). What the user sees is what saves.
  `logMeal` validates that known subtypes don't exceed total fat (±0.5 g), so an
  edited total fat forces the user to reconcile an inconsistent breakdown instead
  of silently saving stale numbers. Estimate **provenance** (source food id,
  confidence, `user_confirmed_at`) is preserved even after the user edits macros.
- **Coverage-aware totals.** `DailyTotals` exposes each fat subtype as
  `{ grams, knownCount, missingCount }`. A blank/null subtype is counted as
  missing, never summed as 0, so the UI shows "Not available" / "partial" instead
  of false precision. Quantity is applied consistently to every macro and subtype.
- **Source labeling.** Manual saves use `source = 'manual'`; assisted saves use
  `source = 'user_estimate'` with the USDA reference. A legacy `source = null`
  row is treated/displayed as a manual log. All appear together in totals/lists.
- **Real Home + persisted goals.** Home reads today's macros/meals from
  `useDailyTotals` (refresh on focus). Edit Goals loads from and saves to
  `profiles` via `getProfileGoals`/`updateProfileGoals`; the trans-fat goal is
  fixed at 0 (DB constraint) and shown as non-editable.

These are **code-only** changes — no migration, function, or secret changes were
made. No new migration is required because migration `0003` already added the
fat-subtype and provenance columns.

## Changed / added files

- `supabase/migrations/0003_nutrition_architecture.sql` — schema (additive).
- `supabase/functions/estimate-meal/index.ts` — edge function handler (direct +
  optional composite orchestration, cache-or-search helper, parse cache).
- `supabase/functions/estimate-meal/usda.ts` — USDA search + nutrient mapping.
- `supabase/functions/estimate-meal/parser.ts` — provider-independent ingredient
  parser + optional OpenAI implementation (no nutrition values; strict JSON).
- `supabase/functions/estimate-meal/composite.ts` — deterministic gram scaling +
  summing of USDA nutrients into a composite estimate.
- `supabase/functions/_shared/cors.ts` — CORS headers.
- `supabase/config.toml` — `[functions.estimate-meal]` with `verify_jwt = true`.
- `src/services/nutrition/types.ts` — shared estimate/candidate types.
- `src/services/nutrition/mealEstimateService.ts` — client entry point (invokes the function; never calls USDA).
- `src/services/mealLogService.ts` — `logMeal` now optionally carries source + fat-type provenance (`MealEstimateMeta`).
- `src/hooks/useMealEstimate.ts` — estimate state hook.
- `src/hooks/useMealLogger.ts` — `applyEstimate()` populates editable fields
  (incl. **visible** fat subtypes); provenance is kept in a ref and carried to
  save; idempotency key rotates only after a confirmed save.
- `src/hooks/useDailyTotals.ts` — fetches the day's rows once and sums them in
  memory via `sumMealTotals` (incl. coverage-aware fat subtypes).
- `src/services/mealLogService.ts` — coverage-aware `DailyTotals`/`sumMealTotals`,
  fat-subtype row mapping, and subtype-vs-total-fat validation.
- `src/services/profileService.ts` — `getProfileGoals`/`updateProfileGoals`.
- `src/screens/main/MealLoggerScreen.tsx` — "Manual / Describe" mode toggle,
  candidate UI, optional fat-breakdown inputs, and honest fat-total display.
- `src/screens/main/HomeScreen.tsx` — real macros/meals via `useDailyTotals`.
- `src/screens/main/EditGoalsScreen.tsx` — loads/saves goals to `profiles`.
- `src/components/FoodLogItem.tsx` — renders the real `mealLogService.MealLog`.
- `tsconfig.json` — excludes `supabase/functions` (Deno) from the app type-check.

## Required Supabase setup (after merging the code)

These steps are done in the Supabase dashboard / CLI; they cannot be done from
the app:

1. **Apply the migration:**
   ```sh
   npx supabase db push
   ```
2. **Get a USDA FoodData Central API key** (free):
   https://fdc.nal.usda.gov/api-key-signup.html
3. **Set the key as a function secret:**
   ```sh
   npx supabase secrets set USDA_FDC_API_KEY=your_key_here
   ```
4. **Deploy the edge function:**
   ```sh
   npx supabase functions deploy estimate-meal
   ```
   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically by
   the edge runtime — do **not** add them manually.
5. **(Optional) enable composite parsing:**
   ```sh
   npx supabase secrets set OPENAI_API_KEY=your_key_here
   # optional model override (defaults to gpt-4o-mini):
   npx supabase secrets set OPENAI_MODEL=gpt-4o-mini
   ```
   Without this secret the function still works and returns direct USDA
   candidates only. `OPENAI_API_KEY` is a **server-side** function secret — never
   add it to `.env` as an `EXPO_PUBLIC_*` variable.

## Verification

- `npx tsc --noEmit` passes (the Deno function is excluded from the app config).
- Once deployed, exercise via the Describe tab with:
  `"grilled chicken breast"`, `"kraft macaroni and cheese"`, `"2 eggs and toast"`,
  `"pizza with pineapple and ham"`. Expect good single-food matches and
  approximate composite matches that the user edits before saving.

## What works vs. what remains approximate

**Works now (code):** on-demand USDA search, 7-day result caching,
per-100g→serving nutrient mapping incl. derived unsaturated fat, candidate
confidence, server-side key isolation, confirm-and-edit before save, separate
fat-type + fiber/sodium capture on the meal log, visible/editable fat breakdown
with no stale hidden values, coverage-aware daily totals, real Home macros/meals,
and Supabase-persisted macro goals.

> **Needs deployment to actually run end-to-end:** applying migrations, setting
> `USDA_FDC_API_KEY`, and deploying the `estimate-meal` function (see "Required
> Supabase setup"). These are **not** done by the code above and require the
> commands below to be run against the project.

**Approximate / future:** quantity parsing ("2 eggs"), composite-meal
decomposition, branded/barcode (Open Food Facts), and richer portion selection
via `food_portions`.

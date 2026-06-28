# MacroLeague Claude Code Prompts

Use these prompts in order. Do not start Prompt 2 until Prompt 1 is implemented,
reviewed, and verified. This sequencing protects the existing manual meal logger
while the automated estimation path becomes more capable.

## Prompt 1: Stabilize Meal Logging, Goals, and Daily Totals

```text
We need to stabilize and complete MacroLeague's existing meal logging and macro
tracking flow without removing or weakening any working behavior.

Primary product requirement:
MacroLeague must permanently support both of these meal-entry methods:

1. Manual logging: the user enters a food name, calories, protein, carbs, total
   fat, quantity, and meal type themselves.
2. Assisted description logging: the user types a description such as "pizza
   with pineapple and ham," receives USDA-based candidate estimates, selects a
   candidate, reviews/edits the fields, and explicitly confirms the meal before
   anything is saved.

Both methods must create the same editable meal draft and must ultimately save
through the existing `logMeal()` service into `public.meal_logs`. Assisted
estimates must never be saved automatically.

Read the complete codebase before editing. In particular inspect:

- `git status`, recent `git log`, and the diff around commits `c4cb133` and
  `55eaf60`. The current local HEAD is `55eaf60`, a revert of "Meal Logging and
  Macro Tracking." Understand what was removed, but do not blindly undo the
  revert or restore an entire historical commit.
- `src/screens/main/MealLoggerScreen.tsx`
- `src/hooks/useMealLogger.ts`
- `src/hooks/useMealEstimate.ts`
- `src/hooks/useDailyTotals.ts`
- `src/services/mealLogService.ts`
- `src/services/nutrition/*`
- `src/screens/main/HomeScreen.tsx`
- `src/screens/main/EditGoalsScreen.tsx`
- `src/services/profileService.ts`
- `src/store/macroStore.ts` and `src/store/userStore.ts`
- `supabase/migrations/0001_phase0_schema.sql`
- `supabase/migrations/0002_relax_carbs_constraint.sql`
- `supabase/migrations/0003_nutrition_architecture.sql`
- `supabase/functions/estimate-meal/*`
- `docs/nutrition-architecture.md`

Before implementation, briefly summarize what is currently real Supabase data,
what is mock/local data, and what the revert changed. Then implement the scoped
work below. Do not stop after proposing a plan.

SAFETY AND SCOPE RULES

- Do not run `git reset`, `git checkout --`, destructive clean commands, or any
  command that discards work.
- Do not revert or cherry-pick a whole commit. Restore behavior selectively in
  the current files after understanding current code.
- Do not modify migrations `0001`, `0002`, or `0003`; they may already be
  applied. If a schema change is truly required, add the next additive migration.
- Do not drop, rename, or change the meaning of existing `meal_logs` columns.
  Preserve `fat_g` as total fat for backward compatibility.
- Keep new database fields nullable where old/manual rows may not contain the
  information. Do not rewrite historical meal logs.
- Do not replace Supabase with another backend and do not introduce an ORM.
- Do not call USDA directly from React Native components or client services.
- Never expose `USDA_FDC_API_KEY`, a service-role key, or another private key in
  Expo environment variables. Existing public Supabase URL/anon values are the
  only client-side Supabase configuration.
- Do not scrape MyFitnessPal, Cal AI, or another proprietary database.
- Do not redesign unrelated screens, gamification, challenges, rewards, auth,
  or navigation as part of this task.
- Avoid new dependencies unless they are essential. Explain any dependency
  before adding it.
- Preserve current styling conventions and keep web and native compatibility.

REQUIRED IMPLEMENTATION

1. Preserve one canonical save path.

Keep `logMeal()` as the single database write path for both modes. Manual mode
must work without estimate metadata. Describe mode must continue to invoke the
`estimate-meal` Edge Function, let the user choose a candidate, populate the
editable form, and save only after the user presses the existing confirmation
button. Do not create a second meal table or a second insert implementation.

2. Correct and complete the meal nutrition model.

The database keeps `fat_g` as total fat. Migration `0003` already adds nullable
`saturated_fat_g`, `trans_fat_g`, and `unsaturated_fat_g`. Update TypeScript row
types, domain types, mapping, validation, insert/update payloads, and daily-total
calculation so these values can travel safely from Supabase to the UI.

Use clear names:

- `fatG` or `totalFatG` means total fat, consistently.
- `saturatedFatG` means saturated fat.
- `transFatG` means trans fat.
- `unsaturatedFatG` means unsaturated fat.

Do not label `fatG` as unsaturated fat. Do not derive trans fat from total fat.
Do not silently convert a missing/null fat subtype into a known zero. Daily
totals should expose whether subtype coverage is incomplete so the UI can show
"Not available" or an equivalent honest state instead of false precision.
Quantities must be applied consistently when totals are calculated.

Manual logging must continue to require only the fields it currently requires.
Fat subtype inputs may be optional. If optional subtype inputs are added, blank
must save as null, not zero. Keep total fat available because existing data,
screens, and migrations rely on it.

3. Prevent stale USDA estimate metadata.

Currently `useMealLogger.applyEstimate()` stores the USDA fat breakdown in a
ref, while the visible total-fat field remains editable. If the user changes
total fat, the original hidden breakdown can become inconsistent.

Implement a deterministic solution:

- USDA subtype values must be visible/editable or clearly represented in the
  meal draft when available.
- If the user changes total fat without also confirming compatible subtype
  values, clear the estimated subtype values to null before saving, or require
  the user to correct them. Never save a stale hidden breakdown.
- Validate that known fat subtypes are nonnegative and do not exceed total fat
  beyond a small rounding tolerance. Missing subtype values remain allowed.
- Preserve source food ID, confidence, and `user_confirmed_at` for an assisted
  estimate even when the user edits its macros. The resulting source should
  clearly mean "USDA-derived estimate confirmed/edited by the user."
- Reset all draft and provenance state after a successful save or explicit reset.

4. Connect Home to real Supabase meals and goals.

`HomeScreen.tsx` currently reads macro totals and today's meals from local mock
stores. Replace those specific readings with `useDailyTotals`/the existing real
meal service. Refresh when Home receives focus so a meal saved on the Log tab
appears on Home without restarting the app.

Adapt `FoodLogItem` carefully or add a focused adapter so it can render the real
service `MealLog` type. Do not globally replace unrelated demo types. Home must
show loading, empty, and recoverable error states. Other demo-only Home content
may remain mocked and should not be rewritten in this task.

5. Persist Edit Goals to Supabase.

Add focused `getProfileGoals()` and `updateProfileGoals()` functions to
`profileService.ts` using the authenticated user's profile and existing RLS.
Update `EditGoalsScreen.tsx` so it loads saved goals, handles loading/errors,
validates them against the currently applied schema constraints, saves to
Supabase, and only reports success after the database update succeeds.

The schema uses separate `goal_unsaturated_fat_g` and `goal_trans_fat_g`; do not
reintroduce `goal_fat_g`. The current database requires the trans-fat goal to be
zero, so represent that honestly in the UI rather than pretending it is an
ordinary total-fat goal. Respect migration `0002`'s 25%-65% carb energy range.
Do not let a local Zustand update be the only persistence mechanism. Local state
may be synchronized after the Supabase write succeeds if existing screens need it.

6. Keep manual and assisted records distinguishable but compatible.

Manual logs should save with `source = 'manual'` when the expanded columns are
available. Assisted logs should retain their USDA/cache reference and confirmed
estimate provenance. Legacy rows with `source = null` must continue to load and
should be treated as legacy manual rows. All three must appear together in daily
totals and confirmed meal lists.

7. Do not expand natural-language parsing in this task.

Keep the current whole-query USDA candidate search behavior. Do not add OpenAI,
ingredient splitting, barcode scanning, or Open Food Facts here. This task first
establishes a reliable shared logging foundation. Update user-facing wording if
necessary so it says "estimate" and does not promise exact composite analysis.

8. Documentation and stale project notes.

Update `docs/nutrition-architecture.md` and the existing next-steps document so
they match the implementation. Remove the obsolete statement that
`useDailyTotals.ts` still queries `goal_fat_g`. Clearly distinguish implemented
code from Supabase steps that still require deployment or verification.

DATABASE AND DEPLOYMENT CAUTION

Inspect migration files and local Supabase link metadata, but do not push a
migration, deploy a function, change secrets, or mutate the remote database
without explicit approval. If remote state cannot be inspected, state that it
is unverified. Provide exact follow-up commands separately.

VERIFICATION

At minimum run:

- `npx tsc --noEmit`
- available existing lint/test commands, if present
- a focused review of `git diff --check`
- `git diff` to confirm changes are scoped

Do not add a large test framework solely for this task. If an existing test
setup exists, add regression tests. Otherwise provide a precise manual test
matrix covering:

A. Manual meal: enter macros, save, refresh, reload, and confirm persistence.
B. Assisted meal: describe food, select candidate, edit it, save, and confirm it
   uses the same meal list and daily totals.
C. Failed estimate: manual logging must remain usable.
D. Edited total fat: stale USDA fat subtype values must not be saved.
E. Legacy/manual row with null subtype values: display must remain truthful.
F. Home refresh: a newly logged meal appears after returning to Home.
G. Goals: save, leave screen, return/reload, and confirm Supabase values persist.
H. Authentication/RLS: users cannot read or change another user's profile/logs.

ACCEPTANCE CRITERIA

- Manual logging behavior is preserved and remains independently usable.
- Assisted logging still requires selection, review/editing, and confirmation.
- Both routes call the same `logMeal()` service and save to `meal_logs`.
- Home displays real daily meals/totals from Supabase.
- Edit Goals persists and reloads from Supabase.
- Total fat is never mislabeled as unsaturated fat.
- Separate fat subtype totals are accurate when known and visibly incomplete
  when source data is missing.
- Editing an estimate cannot save stale hidden fat metadata.
- Existing logs remain readable; no destructive migration is introduced.
- TypeScript passes.

FINAL RESPONSE

Summarize:

1. What you found, including the effect of the revert.
2. Files changed and why.
3. How manual and assisted logging were preserved.
4. Database compatibility decisions.
5. Verification results.
6. Remaining limitations.
7. Exact Supabase migration/function/secret commands that may still need to be
   run, clearly marked as not executed unless approval was provided.
```

## Prompt 2: Composite Meal Descriptions (Run Only After Prompt 1 Passes)

```text
MacroLeague's stabilized meal logger now supports manual entry and USDA
whole-query candidate search. We need to improve descriptions such as "2 eggs
and toast" and "pizza with pineapple and ham" without compromising the working
manual logger or pretending an estimate is exact.

Read the complete current codebase and the verification results from the prior
meal-logging stabilization task before editing. Run `git status` and
`npx tsc --noEmit` first. If the stabilization acceptance criteria are not met,
stop and report the prerequisite instead of building on a broken foundation.

NON-NEGOTIABLE PRODUCT RULES

- Manual logging remains available even if every estimation service is down.
- Description results are editable drafts and are never automatically saved.
- All confirmed drafts continue through the existing `logMeal()` function.
- USDA FoodData Central remains the source of nutrition values.
- A language model, if used, may extract ingredient names, quantities, units,
  preparation hints, and uncertainty. It must not invent calories or macros.
- Do not scrape proprietary nutrition databases.
- Keep all private keys server-side in Supabase Edge Functions.
- Do not modify applied migrations. Add only backward-compatible migrations if
  the current schema cannot represent composition metadata.
- Preserve the existing whole-query USDA search as the fallback path.

DESIGN THE SMALLEST SAFE COMPOSITE FLOW

Preferred flow:

User description
-> authenticated `estimate-meal` Edge Function
-> optional structured ingredient parsing
-> USDA search for each parsed component
-> deterministic scaling/summing of USDA nutrient values
-> response containing component assumptions and confidence
-> editable client draft
-> explicit user confirmation
-> existing `logMeal()` save path

Do not build a brittle parser made only from splitting on words such as "and"
or "with." Foods like "macaroni and cheese" demonstrate why that fails.

First evaluate two approaches and briefly justify the implementation choice:

1. A server-side structured language-model parser with strict JSON validation,
   followed by USDA lookups for nutrition values.
2. A provider-independent parser interface with the current USDA whole-query
   search as the only enabled implementation until a parser secret is present.

If OpenAI-assisted parsing is implemented, it must be optional and degrade
cleanly when `OPENAI_API_KEY` is absent. Use a strict schema and validate every
field. The model returns no nutrition values. Do not expose the key to Expo and
do not add it to `.env` as an `EXPO_PUBLIC_*` variable.

RESPONSE MODEL

Extend the estimate contract additively. Preserve existing candidate fields so
older client behavior remains valid. Composite candidates should include:

- original query
- estimate kind: direct USDA match or composite estimate
- component display names
- parsed quantity/unit when known
- selected USDA FDC ID and cached food ID for each component
- assumed serving grams and serving description
- per-component macros from USDA
- summed macros
- assumptions/warnings
- confidence or confidence range
- fields indicating which quantities were assumed

The UI must show components and assumptions before "Use & Edit." The user must
be able to edit the final macro draft. Do not create a complicated recipe
builder in this phase unless the current architecture already supports it.

CACHING, SECURITY, AND RELIABILITY

- Reuse existing USDA food and search caches.
- Cache normalized parse results only if doing so does not store sensitive user
  data; define a reasonable TTL.
- Require authenticated callers, validate input length/shape, cap component
  count, cap USDA calls, and return useful errors.
- Never log API keys or authorization headers.
- If parsing fails, times out, returns invalid JSON, or produces no useful
  components, fall back to the existing whole-query USDA search.
- If one component fails, return a clearly partial estimate rather than silently
  treating that ingredient as zero.
- Preserve idempotent meal saving and existing RLS behavior.

SAMPLE BEHAVIOR TO VERIFY

- `grilled chicken breast`: likely direct USDA candidate; no unnecessary split.
- `Kraft macaroni and cheese`: preserve as one branded/dish query when possible.
- `2 eggs and toast`: component estimate with explicit portion assumptions.
- `pizza with pineapple and ham`: direct Hawaiian-pizza candidates and/or a
  composite option, clearly labeled as approximate.
- `steak and broccoli, celery, carrots, mashed potatoes`: bounded component
  estimate with assumptions and no silent omissions.
- Empty, huge, malicious, or nonsensical input: rejected safely.

VERIFICATION AND ACCEPTANCE

- Run `npx tsc --noEmit`, existing tests, and `git diff --check`.
- Verify manual logging before and after the change.
- Verify whole-query USDA fallback with parser unavailable.
- Verify composite estimate selection, user editing, explicit confirmation, and
  persistence through the existing `meal_logs` write path.
- Confirm no private key appears under `src/`, app configuration, Expo public
  variables, logs, or committed files.
- Document required Supabase secrets and deployment commands, but do not deploy
  or mutate the remote project without explicit approval.

Finish with changed files, architecture decisions, fallback behavior, security
controls, test results, deployment steps not executed, and honest limitations.
```

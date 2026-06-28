# MacroLeague Claude Code Prompts: Next Implementation Phases

These prompts continue after the meal-logging stabilization and composite-meal
work in `Claude Code prompts - meal logging stabilization.md`.

Use them **in order**. Paste only one prompt into Claude Code at a time. Do not
start the next prompt until the current prompt is reviewed, tested, and either
committed or otherwise saved as a known-good checkpoint.

The prompts intentionally separate infrastructure, authentication, gamification,
competition, and rewards. This keeps each change reviewable and protects the
working manual and assisted meal-log flows.

---

## Prompt 1: Finish and Verify the Current Nutrition/Profile Milestone

```text
We need to finish, verify, and document MacroLeague's current nutrition/profile
milestone before adding another product area.

Read the complete repository before editing. Begin with:

- `git status --short`
- `git diff --check`
- `git diff`
- `npx tsc --noEmit`

There may be uncommitted work from another developer or agent. Treat all
existing changes as valuable. Do not reset, revert, overwrite, or discard them.

CURRENT EXPECTED WORKTREE

The current code may already contain some or all of the following:

- Manual meal logging, editing, and deletion through `logMeal()` and
  `public.meal_logs`.
- USDA direct candidate search through the `estimate-meal` Supabase Edge
  Function.
- Optional composite parsing in:
  - `supabase/functions/estimate-meal/parser.ts`
  - `supabase/functions/estimate-meal/composite.ts`
- Composite candidate fields in `src/services/nutrition/types.ts`.
- Composite assumptions/components displayed in `MealLoggerScreen.tsx`.
- A forward-only `0004_repair_missing_profiles.sql` migration.
- `.maybeSingle()` profile reads and explicit missing-profile errors.
- Profile update calls that verify a row was actually updated.
- Real Supabase meal totals/goals on Home and Meal Logger.

Do not assume these pieces are correct merely because the files exist. Trace the
runtime paths and verify them.

NON-NEGOTIABLE PRODUCT RULES

- Manual logging must work independently of USDA and OpenAI.
- Assisted candidates are editable drafts and are never automatically saved.
- Direct and composite estimates must save through the existing `logMeal()`
  service into the same `meal_logs` table as manual entries.
- USDA remains the only source of nutrition numbers. OpenAI may parse food
  structure but must not generate calories or macros.
- `fat_g` remains total fat. Saturated, trans, and unsaturated fat remain
  separate nullable subtype values.
- Missing nutrition data must remain unknown/null, not become a false zero.
- Existing migrations `0001`, `0002`, and `0003` must not be edited.
- Never expose USDA, OpenAI, or service-role secrets in `src/`, Expo public
  variables, app configuration, logs, or committed files.

REQUIRED WORK

1. Audit the current profile repair.

Confirm that `0004_repair_missing_profiles.sql`:

- uses a `security definer` function with a pinned `search_path`,
- creates profiles for future auth users,
- backfills only missing profiles,
- leaves every existing profile and goal unchanged,
- produces usernames satisfying all current constraints,
- does not weaken RLS or add client INSERT access to profiles,
- only replaces the intended auth trigger.

Confirm all profile reads use intentional singular semantics. A profile primary
key guarantees at most one row, but zero rows must produce a clear application
error rather than HTTP 406/PGRST116. Confirm profile updates detect zero-row
updates instead of reporting false success.

2. Audit the composite estimator end to end.

Trace:

description -> authenticated Edge Function -> optional parser -> component USDA
lookups -> deterministic macro sum -> candidate response -> visible assumptions
-> Use & Edit -> existing editable fields -> explicit Save -> `logMeal()`.

Verify:

- parser absence/failure/timeouts fall back to direct USDA candidates,
- established dish names are not split by brittle string rules,
- component and USDA request counts are bounded,
- input size is bounded before cache/database use,
- every nutrition value comes from a USDA result,
- unmatched ingredients are clearly excluded and warned about,
- quantities and units are scaled deterministically,
- assumed portions are visible before selection,
- incomplete fat subtype coverage stays null,
- composite results do not pretend to represent one cached USDA food,
- older direct candidates remain compatible.

3. Add focused backend tests without introducing a large framework.

The Expo TypeScript config excludes `supabase/functions`, so `npx tsc --noEmit`
does not validate the Edge Function. Add focused Deno tests for pure parser and
composite helpers where practical. Cover at least:

- valid and invalid parser output,
- component count limits,
- mass-unit conversion,
- count/unknown-unit portion assumptions,
- macro summation,
- nullable fat subtype propagation,
- unmatched components,
- all-components-unmatched fallback,
- extreme quantity clamping.

Keep network calls out of unit tests. Inject or stub resolvers.

If Deno is unavailable, still add the tests and clearly report that they could
not be executed. Do not claim Expo TypeScript validation covers Deno code.

4. Correct stale documentation.

Update:

- `docs/nutrition-architecture.md`
- `Next steps (as of 06-15-26).md`
- the stale session tracker in `prompt.md`

The documentation must accurately distinguish:

- implemented locally,
- verified locally,
- requiring Supabase migration deployment,
- requiring Edge Function deployment,
- requiring server-side secrets,
- still unimplemented.

Remove any instruction that places `OPENAI_API_KEY` in the Expo/root `.env`.
Document it only as an optional Supabase Edge Function secret. Keep
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` as the only
client Supabase variables.

`supabase/config.toml` currently enables a seed file path. If
`supabase/seed.sql` does not exist, either add a minimal, safe seed file that is
useful for local development or disable that path until the dedicated seed-data
phase. Do not create auth users by directly inserting incomplete rows.

5. Do not mutate the hosted project.

Do not run `supabase db push`, deploy functions, set secrets, or alter the remote
database without explicit approval. Read-only inspection is allowed. If remote
state cannot be confirmed, call it unverified.

VERIFICATION

Run:

- `npx tsc --noEmit`
- focused Deno tests/checks if the environment supports them
- `git diff --check`
- any existing project tests/lint commands

Provide a manual test matrix for:

- missing-profile account before and after migration 0004,
- new signup profile creation,
- manual meal save/edit/delete,
- direct USDA estimate,
- composite estimate,
- parser unavailable fallback,
- one unmatched component,
- edited macro confirmation,
- Home refresh and goal persistence.

FINAL RESPONSE

Report findings first, then files changed, tests run, tests unavailable, remote
state not verified, and the exact deployment commands that would be run later.
Do not commit or push.
```

---

## Prompt 2: Make Authentication, Onboarding, and Profiles Fully Real

```text
MacroLeague's meal and nutrition foundation is stable. Now make authentication,
onboarding, and profile state consistent and fully backed by Supabase.

Do not start unless Prompt 1's verification passes. Read the current codebase,
especially:

- `App.tsx`
- `src/lib/auth.ts`
- `src/lib/supabase.ts`
- `src/screens/auth/SignInScreen.tsx`
- `src/screens/auth/SignUpScreen.tsx`
- `src/screens/main/ProfileScreen.tsx`
- `src/services/profileService.ts`
- `src/store/userStore.ts`
- `src/types/index.ts`
- migrations `0001` through `0004`

CURRENT PROBLEMS TO SOLVE

- `App.tsx` builds a user object from auth metadata and hardcodes Rutgers,
  muscle goal, zero XP, zero points, and zero streaks instead of loading the
  real profile.
- Sign Up collects name, university, and goal type, but the current profile
  schema/service does not persist all of them.
- The Sign Up success button can locally call `login()` with demo data even when
  no real Supabase session exists. This can display the authenticated app while
  every protected database request fails.
- Google users may enter the app without completing required onboarding.
- Email confirmation behavior may differ between local and hosted Supabase.

SAFETY RULES

- Supabase session state is the authority for authentication.
- Never mark the app authenticated using demo/local data when no session exists.
- Preserve email/password and Google OAuth.
- Preserve working meal logging, profile repair, RLS, and goal persistence.
- Do not edit applied migrations. Add the next migration only.
- Do not add service-role credentials to the app.
- Do not store sensitive auth tokens in Zustand.
- Do not redesign unrelated screens.

REQUIRED DATABASE WORK

Add the next forward-only migration to expand `public.profiles` with the fields
needed by the existing product UI. Prefer conservative defaults and constraints:

- `display_name`
- `university`
- `goal_type`
- `avatar_url`
- `xp`
- `points`
- `streak_count`
- `longest_streak`
- `total_meals_logged`
- `challenges_won`

Use an enum or a constrained text field for goal type, matching the app's current
values. Numeric gamification values must be nonnegative. Keep existing usernames,
goals, timezone, and profile IDs intact. Do not add a second profile table.

Update `handle_new_user()` in the new migration so future signups receive a
valid profile even if email confirmation is enabled. Carefully use safe fields
from `raw_user_meta_data` when present, with valid defaults when absent. Do not
trust metadata to set XP, points, streaks, or other privileged values.

REQUIRED APPLICATION WORK

1. Add typed profile read/update functions.

Create a clear domain type for the real profile. Add focused service methods to:

- load the authenticated user's profile,
- update allowed onboarding/profile fields,
- preserve existing goal methods,
- distinguish missing profile from network/RLS errors.

2. Make signup work with and without immediate sessions.

The current flow gathers onboarding fields before calling sign up. Pass allowed
onboarding data as signup metadata so the database trigger can create the profile
even when email confirmation prevents an immediate authenticated update.

If an authenticated session is returned, refresh/verify the resulting profile.
If confirmation is required, show a truthful "check your email" state and return
the user to sign in. Never use local demo login as a fallback.

3. Handle Google onboarding.

After Google authentication, load the profile. If required onboarding fields are
missing, route to a focused onboarding-completion screen before MainNavigator.
Do not create duplicate auth users or profile rows.

4. Hydrate application state from Supabase.

Refactor `App.tsx` so it:

- resolves the initial Supabase session,
- loads the corresponding profile,
- keeps auth subscription lifecycle clean,
- exposes explicit boot/loading/error states,
- clears user/profile state on sign out,
- does not duplicate large user-mapping blocks,
- never hardcodes profile statistics.

Keep Zustand if useful, but treat it as a client cache of Supabase profile data,
not the source of truth. Eliminate accidental reliance on `DEMO_USER` for real
sessions.

5. Connect Profile to real data.

Use the hydrated profile for name, university, joined date, XP, points, streaks,
and counters. Achievement badges and the weekly chart may remain explicitly
mocked until their backend phases, but label the code/comments honestly.

VERIFICATION

Run TypeScript and existing checks. Manually test:

- existing email user sign in,
- new email signup with confirmations disabled,
- new email signup with confirmations enabled or simulated,
- Google sign in for an existing onboarded user,
- Google sign in for a profile requiring onboarding,
- sign out and reload,
- missing-profile defensive error,
- profile and goals persisting across reload/device sessions,
- no authenticated MainNavigator without a real Supabase session.

Do not push migrations or deploy remotely without approval. Finish with schema
decisions, files changed, auth-state flow, tests, migration/deployment steps not
executed, and remaining limitations.
```

---

## Prompt 3: Implement Backend-Owned XP, Points, and Streaks

```text
MacroLeague now has supabase profiles and a way to save meals. Implement
the first secure gamification loop:

confirmed meal -> create a database (if not created already) and save meal in database -> allows user to earn xP/points award -> daily activity/streak update

(ensure this also reflects on the frontend as well)

Read the current migrations, meal service, profile service, stores, Home, Meal
Logger, and Profile before editing.


NON-NEGOTIABLE RULES

- The backend/database owns XP, points, streaks, and counters. In other words, the XP, points, streaks, and counters that a user earns must be evaluated on the backend. For instance, if the user has kept up with daily protein goals for a second day in a row, then that should be noted on the backend. Afterwards, the "daily streak" should be visible on the frontend. So that the user knows that "oh, i've kept a protein goal streak for 'x' amount of days."

- The Expo client must not be able to submit arbitrary XP or points amounts. THIS is critical
- Retrying the same idempotent meal request must never award points/xp twice.
- Manual, direct USDA, and composite logs receive the same base meal award. This is constant
- Keep `logMeal()` as the one public client save path. This is data structure where most clients will have their meals saved on the backend.
- Preserve meal edit/delete behavior and document the chosen award semantics. Write comments of changes/implementations made and what new code does for the overall project.

- Add a new forward-only migration; never alter old migration files. (HIGHLY IMPORTANT
- Keep all user-owned tables protected by RLS (row level security).

DATABASE DESIGN

Implement a small auditable ledger rather than only mutating counters. Suggested
objects:

- `gamification_events`
  - id
  - user_id
  - event_type
  - source_type
  - source_id
  - xp_delta
  - points_delta
  - occurred_at
  - metadata
- `user_daily_activity`
  - user_id
  - activity_date
  - meal_count
  - first_logged_at
  - last_logged_at

Use uniqueness constraints so the same meal/source event cannot award twice.
Here are some MVP reward constraints, ex: "if streak for protein goal is kept for 20 days, then user will earn potential discounts/coupons at loal store" (this reward is not exclusive to protein goals. I just provided that as context for you)
meal logging earns points and an XP animation, but use one centralized backend
definition rather than duplicating numbers across components.

Implement a database-owned function/trigger or RPC that guarantees the meal
award and profile-counter update are atomic with the relevant database action.
Do not let the client insert arbitrary ledger rows. If a trigger is used, ensure
it cannot recurse and that service-role/database ownership is clear. in other words, the client is NOT allowed to access the backend in any form of capacity.

STREAK RULES

Define streak behavior precisely using each profile's timezone:

- At most one streak-day credit per local calendar day.
- First qualifying meal today starts or maintains the streak.
- A qualifying day immediately following the previous activity day increments
  the streak.
- A gap resets the current streak to 1 on the next qualifying day.
- `longest_streak` never decreases.
- Multiple meals on the same day increment meal count but not streak count.
- Retry of the same meal request changes nothing twice.

Store enough data to make this logic testable and auditable. Avoid relying on the
phone's clock or timezone.

EDIT/DELETE SEMANTICS

Choose and document a conservative MVP rule. Do not leave behavior accidental.
At minimum, users must not be able to duplicate awards through request retries.
If deleting a meal does not reverse earned rewards in this phase, state that
explicitly and identify abuse controls needed before a real monetary launch.

APPLICATION WORK

- Keep `logMeal()`'s caller-facing behavior compatible.
- Return or refresh the latest profile gamification state after a successful log.
- Replace local `addXp`, `addPoints`, `incrementStreak`, and
  `incrementMealsLogged` as authorities. They may be removed or converted into
  cache synchronization helpers.
- Show post-log XP/points feedback only after the backend confirms success.
- Refresh Home/Profile values after logging.
- A failed meal save must award nothing.

TESTING

Add database-level tests or a repeatable SQL test script covering:

- first meal ever,
- second meal same day,
- meal on consecutive day,
- meal after a missed day,
- timezone boundary,
- duplicate `client_request_id`,
- manual versus assisted meal,
- failed insert,
- attempts to write arbitrary points from the client role.

Run TypeScript and existing checks. Do not apply the migration remotely without
approval. Report award rules, transaction boundaries, RLS decisions, tests, and
deployment steps not executed.
```

---

## Prompt 4: Replace Mock Challenges With Supabase Challenges

```text
Implement the first real Supabase-backed challenge system for MacroLeague.
Authentication, profiles, meal logging, and backend-owned gamification must be
working first.

Read:

- the challenge requirements in `prompt.md`,
- `ChallengesScreen.tsx`, `ChallengeCard.tsx`, and `challengeStore.ts`,
- current profile/gamification tables and services,
- current navigation and shared types.

SCOPE FOR THIS PHASE

Support:

- create a challenge,
- list visible active/upcoming/completed challenges,
- join a challenge,
- view participants,
- individual and team challenge membership,
- challenge goals,
- server-calculated participant scores.

Do not implement payments, DMs, full team chat, betting, or complex invitation
systems in this phase.

DATABASE WORK

Add forward-only tables based on the product prompt:

- `challenges`
- `challenge_participants`
- `challenge_goals`

Use enums or constrained values for status/type/goal type. Add primary keys,
foreign keys, useful indexes, timestamps, uniqueness constraints, and date-range
validation. Prevent duplicate membership. Define what happens when a creator or
profile is deleted.

RLS must allow users to:

- read challenges they are allowed to discover or joined,
- create a challenge as themselves,
- join as themselves,
- leave/update only their permitted participant state.

Clients must not directly set trusted score totals, declare winners, or modify
another participant. Avoid broad `using (true)` writes.

SCORING

Implement server-side scoring from real database facts such as:

- qualifying meals,
- daily goal completion,
- protein-goal completion,
- streak activity,
- challenge goal completion.

Use a SQL function/view or carefully scoped Edge Function. Scores must be
recomputable from source data or an auditable event ledger. Do not trust a score
sent by the client.

Start with a small set of goal types that can be calculated reliably from the
current schema. Reject unsupported goal types rather than pretending they work.

APPLICATION WORK

- Add typed challenge services and hooks.
- Replace `challengeStore` mock authority with Supabase-backed loading/actions.
- Preserve loading, empty, error, joined, and unjoined states.
- Make the existing Create Challenge UI persist real rows.
- Make Join/View actions persist and reload correctly.
- Keep unrelated Home sections unchanged, but show a real active challenge card
  when one exists.

TESTING

Cover creator/member/nonmember access, duplicate joins, invalid dates, team
assignment, score tampering attempts, supported goal calculation, and two users
who must not edit each other's participant records.

Do not deploy remotely without approval. Finish with schema/RLS/scoring choices,
files changed, tests, manual two-account matrix, and known limitations.
```

---

## Prompt 5: Replace the Mock Leaderboard With Trusted Rankings

```text
Build MacroLeague's real leaderboard on top of the completed profile,
gamification, and challenge data. Do not create a second independent scoring
system.

Read the current leaderboard screen/component, challenge scoring implementation,
profile schema, gamification ledger, and product prompt.

REQUIRED VIEWS

Implement the existing tabs with clear semantics:

- Global: eligible users ranked by a defined weekly score.
- Friends: defer or show a truthful empty/unavailable state until friendships
  exist; do not use hardcoded friend IDs.
- My Team: participants in the current user's selected/active team challenge.

Use a SQL view, RPC, or secure query that derives rankings from trusted database
data. Define the weekly boundary and timezone behavior. Include rank, display
name, university, score, streak, avatar, and current-user identification where
available.

SECURITY AND PRIVACY

- Expose only fields required for leaderboard display.
- Do not expose email addresses, auth metadata, private goals, or raw activity.
- Users cannot write their own score/rank.
- Add sensible result limits and indexes.
- Define tie-breaking deterministically.

APPLICATION WORK

- Add typed leaderboard service/hook code.
- Replace `MOCK_LEADERBOARD` and hardcoded IDs.
- Preserve podium, list, pinned-current-user, loading, error, and empty states.
- Keep score refresh explicit and reliable.
- Add Realtime only if it is small and robust; otherwise use focus refresh and
  document Realtime as a later enhancement.

TESTING

Cover ranking order, ties, week boundaries, current-user pinning, empty friends,
team filtering, result limits, and privacy of returned columns.

Do not deploy without approval. Report query/view design, scoring reuse, privacy
decisions, tests, and remaining Realtime/friendship work.
```

---

## Prompt 6: Implement Secure Rewards and Atomic Redemption

```text
Implement MacroLeague's first real rewards system. Profiles and backend-owned
points must already be complete. Replace local mock redemption without enabling
negative balances, duplicate redemptions, or client-controlled point deduction.

Read `RewardsScreen.tsx`, mock reward data, current profile/points schema,
gamification ledger, and product requirements.

DATABASE WORK

Add forward-only tables such as:

- `rewards`
- `user_rewards`

Rewards should support partner name, description, points cost, availability,
expiry, image/logo reference, redemption instructions, and timestamps. User
rewards should preserve a snapshot of important reward details at redemption so
later catalog edits do not rewrite history.

Create an atomic server-side redemption RPC/function that:

- requires the authenticated user,
- locks or otherwise safely checks the user's current points,
- verifies the reward exists, is active, and is not expired,
- verifies sufficient points,
- prevents unintended duplicate redemption,
- writes the redemption record,
- records a negative points ledger event,
- updates any cached profile point balance consistently,
- succeeds or fails as one transaction.

The client must never submit a trusted negative point delta directly.

RLS AND ADMIN BOUNDARIES

- Users may read active rewards.
- Users may read their own redemptions.
- Users cannot create/edit reward catalog entries from the app.
- Users cannot create arbitrary redemption rows or point events.
- Document how administrators/seed scripts manage the catalog.

APPLICATION WORK

- Add typed rewards services/hooks.
- Replace `MOCK_REWARDS` and local `Set` redemption state.
- Load the real point balance.
- Show loading, empty, expired, insufficient-points, redeemed, and failure states.
- Show success animation only after the transaction commits.
- Keep QR/barcode fulfillment explicitly mocked unless a secure redemption code
  is implemented.

TESTING

Cover sufficient/insufficient balance, exact balance, expired/inactive reward,
duplicate request, concurrent redemption attempts, another user's redemption,
and rollback when any step fails.

Do not deploy without approval. Report transaction/RLS design, files changed,
tests, catalog seed needs, and fulfillment limitations.
```

---

## Prompt 7: Add Friendships and a Real Activity Feed

```text
Implement the smallest useful social layer after challenges, leaderboard, and
rewards are real.

Read the Home activity feed, leaderboard Friends tab, profile types, and current
RLS patterns.

SCOPE

Support:

- send friend request by username,
- accept or decline a request,
- remove a friendship,
- list friends,
- populate the Friends leaderboard tab,
- show a privacy-safe activity feed for the current user and accepted friends.

Do not add DMs, comments, public follower counts, contact-book upload, or broad
user search in this phase.

DATABASE WORK

Add forward-only friendship and activity objects. Model friendship pairs so the
same pair cannot create duplicate reversed rows. Use constrained statuses and
clear requester/addressee semantics.

Activity events should reference trusted backend events where possible rather
than accepting arbitrary client-written prose. Only expose safe event metadata,
such as meal logged, streak milestone, challenge joined/won, or reward redeemed.
Do not expose exact meal macros or private health goals by default.

RLS must ensure users see only requests involving themselves, accepted friends,
and permitted feed events. Users cannot accept requests addressed to someone
else or fabricate another user's activity.

APPLICATION WORK

- Add typed friendship/activity services and hooks.
- Replace `MOCK_ACTIVITY_FEED` on Home.
- Connect the Friends leaderboard tab to accepted friendships.
- Add focused request-management UI using existing design conventions.
- Use focus refresh first. Add Realtime only after subscription cleanup and RLS
  behavior are verified.

TESTING

Use at least two accounts. Cover duplicate/reversed requests, accept/decline,
remove, unauthorized changes, feed privacy, and Friends leaderboard filtering.

Do not deploy without approval. Report schema, privacy decisions, tests, and
features intentionally deferred.
```

---

## Prompt 8: Add Remaining Meal Entry Modes Without Breaking Existing Logging

```text
MacroLeague already supports manual and description-based logging. Add the
remaining meal-entry capabilities incrementally while preserving those two
working paths.

Implement this prompt in three internal checkpoints. Stop and verify after each
checkpoint. Do not combine everything into one unreviewable rewrite.

PERMANENT RULES

- Manual logging is always available.
- Every automated result becomes the same editable draft.
- Nothing saves until explicit user confirmation.
- Every confirmed meal uses the existing `logMeal()` service and `meal_logs`.
- Private API keys and service-role credentials stay server-side.
- Existing USDA direct/composite fallback remains available.

CHECKPOINT A: SEARCH AND PORTIONS

Turn the current USDA candidate capability into a clear food-search experience:

- searchable result list,
- source/brand/data-type labeling,
- serving/gram selection,
- deterministic re-scaling from per-100g values,
- visible optional nutrient coverage,
- Use & Edit before save.

Use `food_portions` if populated; otherwise show an honest gram/default-serving
choice. Do not pretend a household serving exists when USDA did not provide one.

CHECKPOINT B: RUTGERS DINING DATA

Design a source adapter for Rutgers dining foods rather than hardcoding menu
items in components. First investigate the authorized/public data source and its
terms. Do not scrape a protected or disallowed source.

Normalize dining items into the existing foods/source architecture, retain
campus/location/meal-period/date metadata, and allow one-tap selection followed
by review/edit confirmation. Add a new migration only if the current schema
cannot represent dining metadata cleanly.

Provide a deterministic local seed fixture so development does not depend on a
live Rutgers service.

CHECKPOINT C: PHOTO ESTIMATION

Add `expo-camera` and/or `expo-image-picker` only after explaining why each is
required and using `npx expo install` for compatible versions.

Flow:

capture/select image -> private Supabase Storage upload -> authenticated Edge
Function -> structured food-component description -> USDA resolution -> editable
candidate -> explicit confirmation -> existing `logMeal()`.

The vision model may identify foods and approximate portions, but USDA remains
the source of nutrition numbers. Store photos privately with user-scoped paths
and RLS. Use signed URLs when needed. Validate MIME type and size. Do not make
food photos publicly enumerable.

OPEN FOOD FACTS

Open Food Facts may be introduced for packaged/barcoded products as a separate
provider adapter. Respect attribution and licensing requirements. Do not mix its
cache identity with USDA IDs. Do not scrape MyFitnessPal, Cal AI, or another
proprietary database.

VERIFICATION

After every checkpoint, rerun manual logging, direct description, composite
description, edit, delete, daily totals, and Home refresh. Test provider failure
and confirm manual mode remains usable.

Do not deploy migrations/functions, create production buckets, or set remote
secrets without approval. Finish with checkpoint results, dependencies added,
data-source/licensing decisions, security controls, tests, and deployment steps
not executed.
```

---

## Prompt 9: Seed Data, Notifications, Realtime, and MVP Release Readiness

```text
The real MacroLeague core loop is implemented. Prepare a safe, repeatable demo
and release-readiness pass without replacing real backend behavior with mocks.

Read all current migrations, Supabase config, environment handling, navigation,
and the MVP definition in `prompt.md`.

SEEDING

Create a repeatable `supabase/seed.sql` and supporting documentation for local
development. Seed non-auth reference/product data such as:

- nutrition sources if not already migration-owned,
- active/upcoming challenges,
- challenge goals,
- reward partners/catalog,
- Rutgers fixture foods/menu data.

Do not seed production automatically. Do not directly create malformed auth
users. If demo users require Supabase Auth, provide a separate explicit local
script or documented admin workflow that uses supported auth APIs and is never
run implicitly against production.

DEMO MODE

Choose one explicit strategy:

- a real Supabase demo account with real RLS/backend behavior, or
- a clearly isolated local-only showcase mode.

Do not silently mix mock and real records in the same authenticated experience.
Production builds must not auto-login a shared demo account.

NOTIFICATIONS

Add Expo Notifications only for concrete MVP events such as streak reminders,
challenge ending reminders, and reward confirmation. Store push tokens per user
and device with RLS. Request permission contextually. Do not send private
nutrition details in lock-screen notification text.

REALTIME

Add Realtime selectively for challenge scores/activity after correctness works
with ordinary refresh. Ensure subscriptions are filtered, cleaned up on unmount
and logout, and do not duplicate on rerender.

ENGINEERING READINESS

- Add useful npm scripts for typecheck, lint, formatting check, and tests.
- Add ESLint/Prettier only if absent and configure them for Expo/TypeScript.
- Add environment-variable validation with a useful startup error.
- Ensure no server secrets appear in the Expo bundle or repository.
- Add a concise README setup path for web and native development.
- Add an end-to-end manual acceptance checklist for the entire core loop.

MVP ACCEPTANCE

A first-time user must be able to:

1. Create and complete a real profile.
2. Log manually or use an editable estimate.
3. See database-backed daily totals.
4. Earn backend-confirmed XP/points and maintain a streak.
5. Join/view a real challenge.
6. See a trusted leaderboard rank.
7. Redeem/view a real reward record.
8. Sign out, reload, sign back in, and retain all state.

Verify web and at least the primary target native platform. Report anything that
could not be tested. Do not deploy, build production binaries, mutate production
data, or commit/push without explicit approval.
```

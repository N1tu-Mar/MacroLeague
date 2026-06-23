# MacroLeague Next Steps (as of 06/15/26)

This document is a developer handoff for continuing MacroLeague from the current project state. The app has a strong React Native/Expo frontend prototype, partial Supabase integration, and a first backend foundation for auth, profiles, foods, and meal logs.

## Current Backend State

- Supabase client is configured in `src/lib/supabase.ts`.
- Email/password and Google OAuth helpers exist in `src/lib/auth.ts`.
- App-level auth session listening exists in `App.tsx`.
- Phase 0 Supabase migration exists at `supabase/migrations/0001_phase0_schema.sql`.
- Current database schema includes:
  - `profiles`
  - `foods`
  - `meal_logs`
  - `meal_type` enum
- Row Level Security is enabled for the current tables.
- Users can only access their own profile and meal logs.
- `meal_logs` has idempotency protection through `client_request_id`.
- `src/services/mealLogService.ts` supports:
  - log meal
  - get meals for day
  - get daily totals
  - edit meal
  - delete meal

## Current Frontend State

- Navigation scaffold exists with auth screens and main tabs.
- Main app screens exist:
  - Home
  - Meal Logger
  - Challenges
  - Leaderboard
  - Profile
  - Rewards
  - Settings-style screens
- Meal Logger has a real manual-entry path connected to Supabase services.
- Many screens still rely on local mock data from `src/data/mockData.ts`.
- Zustand stores are currently used for demo user state, macro state, and challenge state.

## Immediate Fixes

1. ~~Fix the profile goal schema mismatch.~~ **Done.**

   The old mismatch (a `goal_fat_g` query against a schema that defines
   `goal_unsaturated_fat_g` + `goal_trans_fat_g`) no longer exists.
   `src/hooks/useDailyTotals.ts` and `profileService` now read/write
   `goal_unsaturated_fat_g` and `goal_trans_fat_g` (trans always 0). The schema
   was **not** simplified to a single `goal_fat_g`; we kept the separate
   unsaturated/trans goals and represent trans = 0 honestly in the UI.

## Next Backend Work

1. Apply the existing Supabase migration to the real Supabase project.

2. Add a profile update service.

   The sign-up screen collects name, university, goal type, and macro targets, but only creates the Supabase auth user right now. After sign-up, save onboarding data into `profiles`.

3. Expand the `profiles` table.

   The prompt expects profile fields such as:
   - username
   - university
   - goal_type
   - avatar_url
   - xp
   - streak_count
   - longest_streak
   - created_at

4. Add daily goals support.

   Decide whether macro goals live directly on `profiles` or in a separate `daily_goals` table. For the MVP, keeping goals on `profiles` is simpler.

5. Add gamification fields and logic.

   Needed soon:
   - XP earned from meal logging
   - points balance
   - streak count
   - longest streak
   - total meals logged
   - challenge wins

6. Add challenge schema.

   Tables from the prompt:
   - `challenges`
   - `challenge_participants`
   - `challenge_goals`

7. Add leaderboard/scoring logic.

   For MVP, scores can be calculated from:
   - meals logged
   - daily goal completion
   - protein goal completion
   - streak activity
   - challenge goal completion

8. Add rewards schema.

   Tables from the prompt:
   - `rewards`
   - `user_rewards`

9. Add social/activity schema.

   Tables from the prompt:
   - `friendships`
   - `activity_feed`

10. Add seed data.

Seed data should include:

- one demo user
- mock leaderboard users
- active challenges
- Rutgers dining hall menu items
- reward partners
- recent meal history

## Next Frontend Work

1. ~~Wire Home screen to real backend data.~~ **Done.**

   Home now reads today's macros/meals/goals from `useDailyTotals` (real
   `meal_logs` + `profiles`) and refreshes on focus. The activity feed,
   challenges, and rewards on Home remain demo data by design. The legacy
   `useMacroStore` is no longer used by Home (kept only for any remaining mock
   surfaces). Edit Goals now also persists to `profiles` instead of local state.

2. Wire sign-up onboarding to Supabase profile updates.

   Save:
   - name
   - username
   - university
   - goal type
   - macro targets

3. Add a demo-mode strategy.

   Developers should decide whether demo mode is:
   - a real Supabase demo account, or
   - local mock data only

   A real Supabase demo account is better for showing the full backend loop.

4. Replace challenge mock store with Supabase-backed services.

   Existing local store: `src/store/challengeStore.ts`.

5. Replace rewards mock data with Supabase-backed services.

6. Replace leaderboard mock data with Supabase-backed query or view.

7. Add meal logging modes from the prompt.

   Current state: manual entry exists.

   Still needed:
   - photo scan
   - food search
   - Rutgers dining hall one-tap logging

8. Add post-log feedback.

   Needed:
   - XP gain animation
   - streak update
   - toast telling user progress toward protein goal

9. Add edit/delete meal UI.

   Backend service functions exist, but the screen does not expose full edit/delete controls yet.

## AI/Food Recognition Work

1. Add image upload/camera dependencies if not already installed.

   From the prompt:
   - `expo-camera`
   - `expo-image-picker`

2. Add Supabase Storage bucket for food photos.

3. Add an Edge Function for photo analysis.

   Do not call OpenAI directly from the mobile app with a private API key. Use a Supabase Edge Function so the key stays server-side.

4. Add food search service.

   Suggested data sources:
   - Open Food Facts API
   - USDA FoodData Central API

## Supabase Edge Functions To Consider

- `analyze-food-photo`
- `calculate-challenge-score`
- `redeem-reward`
- `update-streak`
- `seed-demo-data`

## Security Notes

- Keep `OPENAI_API_KEY` server-side only.
- Never expose service role keys in the Expo app.
- Expo public env vars are visible to the client, so only use them for safe public values like Supabase URL and anon key.
- Keep Row Level Security enabled for all user-owned tables.

## Recommended Build Order

1. Install dependencies and run the app on web.
2. Fix the fat goal schema mismatch.
3. Apply Supabase migration.
4. Complete sign-up profile saving.
5. Connect Home and Meal Logger fully to real Supabase data.
6. Add XP, points, and streak fields.
7. Add challenge tables and services.
8. Add leaderboard query/view.
9. Add rewards tables and redemption flow.
10. Add seed data for demo mode.
11. Add photo/search/dining hall meal logging.
12. Add realtime updates and polish animations.

## Definition Of Done For MVP

The MVP is complete when a first-time user can:

1. Sign up and save macro goals.
2. Log a meal.
3. See daily macro progress update from the database.
4. Earn XP/points from logging.
5. Build or maintain a streak.
6. Join or view a challenge.
7. See leaderboard rank.
8. Redeem or view a reward.

The core loop should feel complete:

```text
log meal -> earn XP -> maintain streak -> affect challenge score -> climb leaderboard -> unlock reward
```

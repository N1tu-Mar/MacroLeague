# MacroLeague Growth And Rewards Strategy

## What the codebase says the MVP is

MacroLeague is not a general nutrition app yet. The product is currently a campus-first, socially competitive nutrition tracker for students who want structure, accountability, and league-style motivation.

Signals from the code:

- The app is built around university identity and dining halls, with seeded schools concentrated in New Jersey and Rutgers clearly treated as the anchor launch campus.
- Onboarding frames the product as a public league with friends, rank, streak, and League Points.
- The core loop is: log meals -> improve daily nutrition score -> earn XP/LP -> move up the leaderboard -> redeem rewards.
- The default goal presets skew toward fitness-minded students: build muscle, lose weight, eat cleaner, or just track.

Relevant files:

- [src/data/universityDining.ts](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/src/data/universityDining.ts:12)
- [docs/design/01-screens.md](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/docs/design/01-screens.md:43)
- [src/screens/main/HomeScreen.tsx](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/src/screens/main/HomeScreen.tsx:166)

## Target demographic

Primary target:

- College students, especially 18-24
- Campus dining users
- Socially motivated people who like rankings, streaks, group challenges, and visible progress
- Students already adjacent to fitness, body composition, sports, lifting, or "trying to eat better"

Best first wedge:

- Students who already care a little, not students who care zero
- Gym-goers, club sports, Greek life, student orgs, roommate groups, and friend clusters
- People who want "healthy-ish accountability" more than strict calorie obsession

This matters because the current product is strongest when a user joins with friends and has a reason to care about rank. Solo wellness users are not the best first growth segment for this exact build.

## Product risk to watch

The main behavioral risk is that the current reward logic can accidentally incentivize more logging, not better nutrition.

Today the backend awards:

- `+50 XP` and `+10 LP` per logged meal
- bonus LP for meal count, protein goal, macro accuracy, and streak milestones

Relevant files:

- [supabase/migrations/0006_gamification_phase1_rules.sql](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/supabase/migrations/0006_gamification_phase1_rules.sql:153)
- [supabase/migrations/0006_gamification_phase1_rules.sql](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/supabase/migrations/0006_gamification_phase1_rules.sql:291)
- [docs/design/01-screens.md](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/docs/design/01-screens.md:61)

That is good for activation, but if rewards become real and valuable, users can start optimizing for points rather than health. The existing seed catalog is also only partly aligned with "eat healthier":

- `RU Cafe`
- `Fusion Smoothies`
- `Playa Bowls`
- `Scarlet Fitness`
- `Muscle Meals Prep`

Relevant file:

- [supabase/migrations/0006_gamification_phase1_rules.sql](/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo/supabase/migrations/0006_gamification_phase1_rules.sql:213)

## How to scale to real people

Do not try to scale nationally first. Start as a dense network product.

Recommended rollout:

1. Launch at one campus first, ideally Rutgers.
2. Target 3-5 existing micro-communities instead of the whole school.
3. Use group onboarding: "join your dorm / club / friend league."
4. Measure activation by team density, not raw signups.

Why this fits the code:

- The app already assumes university identity, friend competition, and 2-week leagues.
- The leaderboard and challenges become much more compelling with known peers than with anonymous users.

The best early user groups are:

- weight room / rec center regulars
- club sports teams
- Greek life houses
- friend groups in dorms
- health or wellness clubs

## Reward system recommendation

The cleanest way to make rewards support healthier behavior is:

1. Reward consistency first
2. Reward nutritious choices second
3. Reward volume only in bounded ways

### What to reward

Good reward triggers:

- first 3 meals logged in a day, but not unlimited meals
- hitting protein target
- completing a balanced day
- 5-of-7 consistent logging days
- challenge completion
- streak recovery after a miss
- healthy swaps or dining-hall choices when that data exists

Bad reward triggers:

- every additional meal forever
- aggressive calorie minimization
- exactness that encourages obsessive behavior
- anything that makes junk-food or caffeine rewards the easiest path

## Better rewards for this product

Use a 3-layer reward stack.

### Layer 1: instant in-app rewards

These are safest and cheapest:

- badges
- titles
- avatar cosmetics
- streak shields
- profile flair for challenge wins
- league-end trophies
- special challenge access

These work especially well because MacroLeague already leans heavily into identity, rank, and progression.

### Layer 2: healthy real-world rewards

These should reinforce the behavior you want:

- free fruit cup
- salad or veggie side add-on
- grilled protein add-on
- low-sugar smoothie option
- healthy bowl discount
- campus rec center guest pass
- nutrition consult raffle
- meal prep discount

### Layer 3: social/status rewards

These are underrated and can be powerful on campus:

- league winner wall
- dorm or org leaderboard recognition
- captain-only challenge creation
- "campus ambassador" status
- end-of-week winner shoutouts

## Specific changes I would make

### 1. Cap meal-based LP earning

Keep logging unlimited, but cap score-bearing meals per day. That avoids rewarding extra eating just to farm LP.

Best default:

- first 4-5 meals can earn base LP
- anything after that still logs normally, but does not award base LP

### 2. Shift more value to day-level outcomes

Right now the app already has protein goal, macro accuracy, meal-count, and streak bonuses. Lean harder into day completion and consistency, and a little less into raw meal count.

Recommended weighting direction:

- lower importance of `per_meal`
- higher importance of consistency streaks and challenge completion
- keep protein bonus
- make "balanced day" feel more rewarding than "I logged 6 times"

### 3. Rework the reward catalog around healthy defaults

A better launch catalog would be:

- `250 LP`: fruit/protein snack
- `350 LP`: smoothie with healthy menu constraints
- `400 LP`: dining hall premium add-on
- `500 LP`: healthy bowl discount
- `600-750 LP`: rec center pass or meal prep discount

### 4. Add "earned by healthy behavior" labeling

On the Rewards screen, show why the user earned progress:

- `3-day consistency streak`
- `protein goal hit 4 times this week`
- `won Protein Push`

That reframes LP as a reflection of healthy consistency, not just app usage.

## Recommendation on your core concern

If the mission is "help people eat healthier and be more mindful," then rewards should not mainly be "random treats for app engagement."

They should feel like:

- support for healthy choices
- proof of consistency
- social recognition
- occasional light perks

The healthiest version of MacroLeague is not "log more to get prizes."
It is "show up consistently, make a few better choices, and feel momentum with your friends."

## Best next move

If you want the strongest v1, I would recommend this exact sequence:

1. Launch with one-campus social leagues
2. Cap meal-based LP earning
3. Keep XP for fun progression
4. Make LP primarily about consistency and challenge outcomes
5. Replace any weakly aligned rewards with healthy campus perks plus in-app status rewards


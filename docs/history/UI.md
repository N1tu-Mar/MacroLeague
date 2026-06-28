

```
ROLE
You are a senior UI/UX design engineer. Your job is to make MacroLeague's
existing UI stop looking AI-generated ("vibecoded" / "AI slop") and start
looking like a deliberately designed product that real human beings will purchase. without changing what the app
does. and You are Claude Code working inside my existing frontend codebase.

Your job is to redesign/build the frontend UI for a competitive diet-tracking app.

This is NOT a normal calorie tracker.
This is NOT a clean SaaS dashboard.
This is NOT MyFitnessPal with badges.

The correct mental model is:

"A fantasy sports league for meal tracking."

More specifically:

Fantasy Premier League structure
+
Duolingo progression/rewards
+
Clash Royale anticipation/reward hierarchy
+
Strava social motivation
+
Modern mobile app polish

The app should make users feel like:

"I am competing in a nutrition league with my friends."

Not:

"I am entering calories into a database."

Before implementing anything, inspect the existing project structure and determine:

1. What framework is being used
2. Where pages/screens live
3. Where shared components live
4. Where styling/theme files live
5. Whether Tailwind, CSS modules, shadcn, or another UI system is currently used
6. How routing/navigation is currently handled
7. Whether mock data or real Supabase/backend data is currently being used

Then create a short implementation plan before coding.

Do not ask me broad design questions. Make strong reasonable product/design decisions based on this prompt.

HIGH-LEVEL PRODUCT LOOP

The core loop should feel like this:

1. User logs meal
2. User instantly earns points
3. Nutrition score updates
4. Daily/weekly progress moves
5. League rank may change
6. Friends see activity
7. User gets closer to rewards/challenges
8. User wants to come back later to check standings

Every screen should support that loop.

The app should feel alive, competitive, and rewarding.

CORE DESIGN PRINCIPLES

1. Progress Everywhere

Every major screen should answer within 0.5 seconds:

"How am I doing?"

Show progress visually through:

- Nutrition score
- Protein progress
- Calorie target progress
- Meal logging streak
- Weekly league points
- Rank movement
- Challenge progress
- Reward unlock progress

Avoid flat lists of numbers without visual meaning.

2. Strong Visual Hierarchy

Each screen must have:

- One dominant primary element
- Two to three supporting secondary elements
- Everything else visually quieter

Do not make every card the same size and importance.

Bad:

- Six equal cards in a grid
- Every metric has the same visual weight
- Dashboard looks like analytics software

Good:

- Big rank/score hero section
- Clear next action
- Small supporting metrics
- Social/rival context underneath

3. Controlled Stimulation

The UI should be playful, but not chaotic.

Use:

- Mostly neutral surfaces
- Strategic bursts of color
- Strong spacing
- Soft rounded cards
- Reward moments
- Micro-animations

Avoid:

- Gradient everywhere
- Glassmorphism
- Neon glows
- 8 random accent colors
- Cards inside cards inside cards
- Generic AI-generated illustrations
- Startup landing page visuals
- Enterprise dashboard styling

The app should feel premium and fun, not childish or cheap.

4. Competitive Energy

The user should constantly feel:

- Current rank
- Points earned this week
- Who they are chasing
- Who is behind them
- Whether they are in promotion/relegation danger
- Time left in the weekly competition

Examples of copy:

- "You are 12 pts behind Alex"
- "Promotion zone: Top 3"
- "2 days left in Week 24"
- "Sarah just passed you"
- "Log dinner to reclaim 3rd"

5. Social Presence

Friends should appear throughout the UI.

Use:

- Avatars
- Leaderboard rows
- Activity feed items
- Rival comparison cards
- Reactions
- Recent friend achievements
- Rank movement indicators

This should feel closer to Strava/FPL than a private health tracker.

VISUAL IDENTITY

The visual style should be:

Premium mobile app
Playful sports league
Friendly game UI
Nutrition-focused but not medical

Think:

80% polished consumer app
20% game layer

Do not make it look like:

- A hospital app
- A spreadsheet
- A finance dashboard
- A generic shadcn/Tailwind starter
- A crypto dashboard
- A SaaS admin panel

INSPIRATION BREAKDOWN

Fantasy Premier League inspiration:

- Weekly gameweeks
- Leagues
- Tables/leaderboards
- Promotion/relegation zones
- Friend rivalries
- Rank movement
- Weekly reset structure

Duolingo inspiration:

- Streaks
- XP/progress bars
- Friendly rounded UI
- Small celebrations
- Strong progress visibility
- Habit loops
- Goal completion feedback

Clash Royale inspiration:

- Reward hierarchy
- Trophy-like point systems
- Chests/unlocks/countdowns
- Clear primary reward per screen
- Anticipation mechanics
- Visual importance around rank/rewards

Strava inspiration:

- Social feed
- Friend activity
- Kudos/reactions
- Recent achievements
- Social accountability

Do not copy logos, brand assets, exact colors, or copyrighted UI. Use these only as product/design inspiration.

DESIGN SYSTEM REQUIREMENTS

Before building screens, define a coherent design system.

Create or update design tokens for:

1. Color
2. Typography
3. Spacing
4. Border radius
5. Shadows
6. Component hierarchy
7. Motion/animation
8. Interactive states

COLOR SYSTEM

Use a mostly neutral foundation with meaningful accent colors.

Suggested palette direction:

Base:
- App background: warm off-white or very light gray
- Surface: white
- Elevated surface: slightly warm white
- Primary text: near-black charcoal
- Secondary text: muted gray
- Borders: soft neutral gray

Accent colors:
- Green: completed goals, healthy actions, positive progress
- Gold: first place, trophies, achievements, rewards
- Orange: streaks, momentum, urgency without danger
- Red: missed goals, relegation danger, negative rank movement
- Purple or electric blue: league identity / primary brand accent

Rules:

- Do not use all accent colors everywhere.
- Use color semantically.
- Most screens should be neutral with focused bursts of color.
- Reward states can be more colorful than normal states.
- Danger/relegation states should be visible but not anxiety-inducing.

TYPOGRAPHY

Use bold, readable mobile typography.

Requirements:

- Large display numbers for score/rank/points
- Strong headings
- Short labels
- Clear hierarchy between title, metric, helper text, and metadata

Examples:

- Nutrition Score: huge
- Current Rank: huge
- Points earned: medium
- Label/explanation: small

Avoid tiny dashboard text.

SPACING

Use generous mobile spacing.

Suggested scale:

4, 8, 12, 16, 20, 24, 32, 40

Rules:

- Do not cram metrics together.
- Primary cards need breathing room.
- Use consistent vertical rhythm.
- Avoid dense enterprise-table layouts on mobile.

RADIUS

Use soft rounded corners.

Suggested:

- Small elements: 10-12px
- Cards: 18-24px
- Hero cards: 24-32px
- Pills: full radius

Avoid sharp enterprise corners.
Avoid extreme blob shapes unless used sparingly.

SHADOWS

Use subtle elevation.

Requirements:

- Cards should feel tactile but clean.
- Reward/chest/modal cards can have stronger elevation.
- Do not use heavy dark shadows everywhere.

MOTION

Use subtle micro-interactions.

Good motion:

- Progress bar fills
- Score counts up
- Rank movement slides slightly
- Button press scale
- Reward modal pops in
- Streak flame pulses once
- Points earned toast appears after logging

Bad motion:

- Constant floating blobs
- Huge page transitions
- Endless animations
- Random bouncing elements
- Motion that slows down logging

Animation timing:

- Fast UI feedback: 120-180ms
- Progress fill/count-up: 400-700ms
- Reward modal: 250-350ms

APP STRUCTURE

Build mobile-first.

Primary bottom navigation:

1. Home
2. League
3. Log Meal
4. Challenges
5. Profile

The Log Meal item should be visually emphasized, either as:

- A centered raised action button
or
- A bold primary tab

The app should work beautifully at common mobile widths like 375px, 390px, and 430px.

On desktop, center the app in a mobile shell or use a constrained max-width layout. Do not stretch mobile cards across the entire desktop screen.

SCREEN 1: HOME / TODAY ARENA

Purpose:

This is the main daily dashboard.

It should immediately show:

- Current league rank
- Nutrition score
- Daily progress
- Streak
- Main rival
- Next best action
- Recent friend activity

Suggested layout:

Top section:
- Greeting
- Current week/gameweek label
- Small league badge

Hero card:
- Current rank, for example "#4"
- League name, for example "Gold League"
- Points this week
- Gap to next friend, for example "12 pts behind Alex"
- Promotion/relegation status

Nutrition score card:
- Big circular or radial score display
- Example: "87"
- Label: "Nutrition Score"
- Delta: "+6 today"
- Small status: "Strong day"

Daily progress section:
- Protein progress bar
- Calories target progress bar
- Meal logging progress
- Fiber or hydration progress if available

Streak card:
- Flame icon
- Current streak number
- Text like "Protect your 12-day streak"

Next action card:
- "Log dinner to earn up to +22 pts"
- Primary CTA: "Log Meal"

Rival card:
- Avatar of nearest friend
- "You are chasing Alex"
- Point gap
- Tiny progress/race visualization

Activity feed preview:
- "Sarah hit her protein goal"
- "Mike moved into 2nd"
- "Alex completed the Breakfast Builder challenge"

SCREEN 2: LEAGUE

Purpose:

This is the competitive heart of the app.

It should feel like a fantasy sports table, not a generic leaderboard.

Must include:

- League name
- Week/gameweek number
- Time remaining
- User's rank
- Promotion zone
- Relegation/danger zone
- Rank changes
- Friend avatars
- Points
- Weekly movement

Suggested layout:

Header:
- "Gold League"
- "Week 24"
- Countdown: "2d 14h left"

User status card:
- Current rank
- Points
- Zone status
- Gap to promotion / safety / first place

Leaderboard:
Each row should include:

- Rank number
- Avatar
- Name
- Points
- Rank movement indicator
- Small badge/status

Rows should visually distinguish:

- First place
- Promotion zone
- Current user
- Rival
- Relegation zone

Use sticky/current-user treatment if possible.

Promotion/relegation:
- Top 3 promoted
- Bottom 3 relegated
- Clear visual zones

Rival comparison:
- "You vs Alex"
- Your points vs their points
- Suggested action: "Hit protein goal today to pass Alex"

SCREEN 3: LOG MEAL

Purpose:

Meal logging must feel fast and rewarding, not like data entry.

The user should feel:

"I can log this quickly and get points."

Not:

"I am filling out a nutrition form."

Suggested flow:

Entry screen:
- Big title: "Log a meal"
- Meal type selector: Breakfast, Lunch, Dinner, Snack
- Quick add cards
- Manual add option
- Photo/AI option if supported by the app
- Recent meals
- Favorites

Meal card:
- Food name
- Calories
- Protein
- Fiber
- Estimated points
- Tags like "High Protein", "Balanced", "Streak Saver"

Before submit:
- Preview points earned
- Show which goals this helps
- Example:
  "+18 league pts"
  "Protein goal: 72% → 89%"
  "Daily score: 81 → 87"

After submit:
Show a reward moment:

- Points earned toast
- Score count-up
- Progress bars fill
- Potential rank movement
- Challenge progress update

Do NOT just show "Meal logged successfully."

Use copy like:

- "+18 pts earned"
- "Protein goal almost complete"
- "You passed Mike"
- "Dinner logged. Streak protected."

SCREEN 4: CHALLENGES

Purpose:

Challenges create goals beyond calories.

Types:

Daily challenges:
- Log 3 meals
- Hit protein goal
- Stay within calorie range
- Eat 25g fiber
- Drink water
- No late-night snack

Weekly challenges:
- Hit protein goal 5 days
- Stay consistent for 7 days
- Beat your rival 3 days this week
- Complete 15 meal logs
- Maintain streak

Challenge card requirements:

Each card should include:

- Icon
- Title
- Short description
- Progress bar
- Reward points
- Time remaining
- Status: Not started / In progress / Claimable / Completed

Visual hierarchy:

- Claimable rewards should stand out
- Completed should feel satisfying
- Expiring soon should have urgency
- Locked challenges should create anticipation

Add a reward chest/unlock system:

Examples:

- "Sunday Reward Chest"
- "Unlocks when you complete 5 weekly challenges"
- "3/5 challenges complete"
- "Claim +80 bonus pts"

SCREEN 5: PROFILE

Purpose:

Profile should feel like a player card.

Not a settings page.

Must include:

- Avatar
- Username
- Current division
- Best rank
- Current streak
- Lifetime points
- Trophy cabinet
- Achievements
- League history
- Personal records

Suggested sections:

Player card:
- Avatar
- Name
- Current league
- Nutrition style/personality badge
- Example badges:
  "Protein Machine"
  "Consistency King"
  "Comeback Player"

Trophy cabinet:
- Weekly wins
- Promotions
- Challenge medals
- Streak milestones

Stats:
- Best weekly score
- Longest streak
- Average nutrition score
- Protein goal hit rate
- Total meals logged

History:
- Past weeks
- Rank finishes
- Promotions/relegations

SCREEN 6: WEEKLY RECAP

If not already present, create a weekly recap screen/modal.

Purpose:

Make the weekly reset feel exciting.

Include:

- Final rank
- Points earned
- Rank movement
- Goals hit
- Best day
- Biggest improvement
- Friend winner
- Promotion/relegation result
- Next week preview

Examples:

- "You finished 3rd in Gold League"
- "Promoted to Platinum"
- "Best day: Wednesday, 94 Nutrition Score"
- "You beat Alex by 8 pts"
- "Next week starts Monday"

COMPONENTS TO CREATE OR IMPROVE

Create reusable components instead of one-off UI.

Core components:

1. AppShell
- Mobile-first layout
- Bottom navigation
- Safe area handling
- Consistent page padding

2. LeagueHeroCard
Props:
- leagueName
- weekLabel
- rank
- points
- zoneStatus
- timeRemaining
- nextRival
- gapToRival

3. NutritionScoreCard
Props:
- score
- previousScore
- delta
- status
- progressToGoal
- message

4. MacroProgressBar
Props:
- label
- current
- target
- unit
- status
- colorMeaning

5. StreakCard
Props:
- streakCount
- streakStatus
- nextMilestone

6. RivalCard
Props:
- user
- rival
- pointGap
- suggestedAction

7. LeaderboardRow
Props:
- rank
- previousRank
- name
- avatar
- points
- isCurrentUser
- isPromotionZone
- isRelegationZone
- isRival
- badges

8. ChallengeCard
Props:
- title
- description
- progress
- target
- rewardPoints
- timeRemaining
- state

States:
- locked
- active
- claimable
- completed
- expired

9. RewardChestCard
Props:
- title
- unlockProgress
- unlockRequirement
- timeRemaining
- state

States:
- locked
- unlocking
- claimable
- opened

10. ActivityFeedItem
Props:
- avatar
- name
- action
- timestamp
- reactionCount
- type

Types:
- meal_logged
- goal_hit
- rank_change
- challenge_completed
- streak_extended

11. PointsToast / RewardModal
Purpose:
- Show reward after meal logging or challenge completion

Must include:
- Points earned
- Progress updated
- Optional rank movement
- CTA to view league

12. TrophyCard
Props:
- trophyName
- rarity
- earnedDate
- description
- icon

DATA / MOCKING

If real backend data is not wired yet, create realistic mock data.

Mock data should include:

- Current user
- 8-12 friends
- League leaderboard
- Rank changes
- Daily nutrition progress
- Meal logs
- Challenges
- Activity feed
- Trophies
- Weekly recap

Use realistic names, point totals, and statuses.

Example leaderboard data:

1. Sarah - 842 pts
2. Alex - 830 pts
3. Mike - 811 pts
4. You - 798 pts
5. Jordan - 772 pts

Current user should not always be first.
The UI is more interesting when the user is chasing someone.

INTERACTION REQUIREMENTS

Meal logging interaction:

When a meal is logged:

1. Show points earned
2. Animate nutrition score changing
3. Fill relevant progress bars
4. Update challenge progress
5. If rank changes, show rank movement
6. Show a short reward modal/toast

Leaderboard interaction:

- Tapping a user row can show quick comparison
- Current user row should be visually highlighted
- Rival row should have subtle emphasis
- Promotion/relegation boundaries should be clear

Challenge interaction:

- Claimable challenge should have strong CTA
- Completed challenge should feel satisfying
- Locked challenge should tease the requirement

VISUAL COPY EXAMPLES

Use motivating, competitive copy.

Good:

- "Log dinner to pass Alex"
- "You are 12 pts from promotion"
- "Protein goal almost locked"
- "Streak protected"
- "+18 league pts"
- "Sarah just took 1st"
- "2 days left in Week 24"
- "Complete 2 more challenges to unlock your Sunday chest"

Bad:

- "Meal logged successfully"
- "Data updated"
- "Nutrition information"
- "Dashboard"
- "Submit"
- "User stats"

QUALITY BAR

The finished frontend should feel like a real consumer app someone would open multiple times per day.

Acceptance criteria:

1. On the home screen, within 5 seconds, I should understand:
   - My rank
   - My nutrition score
   - My streak
   - My next action
   - Who I am chasing

2. The League screen should feel competitive, not like a static table.

3. Meal logging should feel rewarding immediately after submission.

4. The UI should use a coherent design system.

5. Components should be reusable and cleanly organized.

6. The design should be mobile-first and responsive.

7. It should not look like default Tailwind/shadcn.

8. It should not look like a generic health app.

9. It should not use random gradients/glass/neon effects.

10. It should pass lint/build/type checks if those commands exist.

IMPLEMENTATION RULES

- Use the existing stack and conventions in the repo.
- Do not introduce large new dependencies unless absolutely necessary.
- If shadcn components exist, restyle them heavily so the product does not look like a default shadcn app.
- Keep code modular.
- Use TypeScript types/interfaces where appropriate.
- Create mock data in a dedicated file if backend data is unavailable.
- Preserve existing auth/backend logic.
- Do not break Supabase integration if it exists.
- Prefer simple reliable CSS/Tailwind over overengineered animation libraries.
- Use accessible contrast.
- Ensure buttons, cards, and nav states are clear.
- Make empty/loading/error states polished.

ANTI-VIBE-CODE CHECKLIST

Before finalizing, review the UI against this checklist.

Reject the design if it has:

- Generic dashboard cards
- Too many equal-sized metric boxes
- Random gradients
- Random glassmorphism
- Neon glow effects
- Too many accent colors
- Weak hierarchy
- No visible friend/rival presence
- No clear weekly competition structure
- No reward/anticipation mechanics
- Meal logging that feels like form entry
- Leaderboard that looks like a boring table
- Home screen that does not show rank/score/action immediately

FINAL OUTPUT

After implementation, summarize:

1. Files changed
2. New components created
3. Design system decisions
4. How to run/test the app
5. Any known limitations
6. Suggested next improvements
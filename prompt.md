# MacroLeague — Claude Code Build Prompt

## Overview

Build **MacroLeague**, a gamified nutrition tracking mobile app for iOS using React Native. The core thesis: most nutrition apps fail because they're tedious and offer no immediate reward. MacroLeague fixes this by wrapping habit-building in competition, streaks, and real-world rewards — think FanDuel meets Duolingo for healthy eating. The MVP targets Rutgers University students but is designed to scale to other campuses and eventually workplaces and neighborhoods.

---

## Problem Being Solved

Most people struggle to track their nutrition because existing apps are boring, repetitive, and offer no tangible benefit in the short term. There's no social hook, no competitive layer, and no reason to come back tomorrow. MacroLeague solves this with team-based challenges, streak rewards, and real discounts from local partners — making consistency feel like winning.

---

## Tech Stack

### Frontend

- **React Native** (Expo) — cross-platform, iOS-first
- **NativeWind** (Tailwind CSS for React Native) — utility-first styling
- **React Navigation** — tab and stack navigation
- **Reanimated 3** — smooth animations, streak celebrations, challenge countdowns
- **Expo Camera + Expo Image Picker** — for AI food photo scanning
- **React Native SVG** — progress rings, macro charts
- **Lottie React Native** — celebration/reward animations (confetti, XP gain)
- **React Native Gesture Handler** — swipe interactions

### Backend

- **Supabase** — primary backend
  - Auth (email/password + Google OAuth)
  - PostgreSQL database
  - Realtime subscriptions (live leaderboard updates)
  - Storage (food photos)
- **Supabase Edge Functions** — serverless logic (challenge scoring, reward validation)

### AI / Food Recognition

- **OpenAI GPT-4o Vision API** — analyze food photos, estimate macros
- **Open Food Facts API** — free food database for search-based logging
- **USDA FoodData Central API** — fallback nutritional data

### Notifications

- **Expo Notifications** — streak reminders, challenge updates, team alerts

### State Management

- **Zustand** — lightweight global state (user, team, streak, macros)

### Dev Tools

- **TypeScript** — strictly typed throughout
- **ESLint + Prettier** — code quality
- **Expo EAS Build** — iOS build pipeline

---

## Visual Design System

### Aesthetic

Dark mode — FanDuel/ESPN energy. Think: deep black backgrounds, electric green and neon orange accents, bold high-contrast typography, stadium-like energy. Every screen should feel like you're about to compete in something.

### Color Palette

```
Background:     #0A0A0F  (near black)
Surface:        #13131A  (card background)
Surface2:       #1C1C28  (elevated elements)
Primary:        #00FF87  (electric green — CTAs, active streaks)
Accent:         #FF6B35  (neon orange — alerts, challenges, rival scores)
Gold:           #FFD700  (rewards, top leaderboard)
Text Primary:   #FFFFFF
Text Secondary: #8888A0
Border:         #2A2A3A
```

### Typography

- **Display / Headers**: `Barlow Condensed` — bold, athletic, tight spacing (like ESPN scoreboards)
- **Body**: `DM Sans` — clean, readable, modern
- **Numbers / Stats**: `Roboto Mono` — tabular, precise (macro counts, scores)

### Component Rules

- Cards: `border-radius: 16px`, subtle `border: 1px solid #2A2A3A`, slight glow on active states
- Buttons: Full-width pill shape for primary CTAs, outlined for secondary
- Progress bars: Neon green fill, animated on load
- Tabs: Bottom tab bar, icon + label, active state glows green
- Avatars: Circular with colored ring indicating streak status

---

## App Structure

```
MacroLeague/
├── app/
│   ├── (auth)/
│   │   ├── welcome.tsx         # Splash / landing
│   │   ├── sign-up.tsx
│   │   └── sign-in.tsx
│   ├── (tabs)/
│   │   ├── index.tsx           # Home / Dashboard
│   │   ├── log.tsx             # Meal Logger
│   │   ├── challenges.tsx      # Team Challenges
│   │   ├── leaderboard.tsx     # Leaderboard
│   │   └── profile.tsx         # Profile / Streaks
│   ├── rewards.tsx             # Rewards / Discounts
│   └── _layout.tsx
├── components/
│   ├── ui/                     # Buttons, Cards, Badges, Inputs
│   ├── MacroRing.tsx           # Circular macro progress
│   ├── StreakFlame.tsx          # Animated streak counter
│   ├── ChallengeCard.tsx
│   ├── LeaderboardRow.tsx
│   └── FoodLogItem.tsx
├── lib/
│   ├── supabase.ts
│   ├── openai.ts
│   └── foodApi.ts
├── store/
│   ├── userStore.ts
│   ├── macroStore.ts
│   └── challengeStore.ts
└── types/
    └── index.ts
```

---

## Screens & Features

### 1. Onboarding / Sign Up

**Goal**: Get users in fast, collect just enough data to personalize.

- Welcome screen with app name + tagline: _"Eat. Compete. Win."_
- Dark background with animated particle/glow effect
- Sign up with email or Google
- Onboarding flow (3 steps, progress dots at top):
  - Step 1: Name + University (pre-populated: Rutgers)
  - Step 2: Goal selection (Build muscle / Lose weight / Eat cleaner / Just track)
  - Step 3: Daily macro targets (auto-calculated with option to customize — Protein / Carbs / Fats / Calories)
- Skip option (uses default targets, can edit later)
- Animated checkmark / celebration on completion

**Supabase**: Insert user row with `profile` table on sign-up completion.

---

### 2. Home / Dashboard

**Goal**: Instant snapshot of today's progress + active challenge status.

**Top Section — Today's Macros:**

- Greeting: "Good morning, [Name] 🔥"
- Streak badge (e.g., "7-day streak") with flame icon
- 4 macro progress rings in a row: Calories, Protein, Carbs, Fats
  - Each ring fills with animated stroke on load
  - Color-coded: Green = on track, Orange = behind, Red = over
- "Log a Meal" primary CTA button

**Middle Section — Active Challenge:**

- Card showing current team challenge
  - Challenge name, end date countdown timer
  - "Your Team" vs "Rival Team" with scores
  - Progress bar showing who's winning
  - Tapping opens full challenge screen

**Bottom Section — Recent Activity Feed:**

- List of today's logged meals with macro summary
- Teammate activity (e.g., "Jake logged lunch — 42g protein 💪")
- Realtime via Supabase subscriptions

---

### 3. Meal Logger

**Goal**: Log a meal in under 30 seconds.

**Two logging modes (tabs at top):**

**Mode A — Photo Scan (AI):**

- Full-screen camera view with scan frame overlay
- Tap to capture or upload from camera roll
- Loading state: "Analyzing your meal..." with animated dots
- AI (GPT-4o Vision) returns:
  - Food name + estimated portion
  - Macro breakdown (Protein, Carbs, Fats, Calories)
- User can adjust quantities with a slider before confirming
- Confirm button saves to Supabase `meal_logs` table

**Mode B — Search:**

- Search bar at top (queries Open Food Facts API)
- Results list with food name, brand, macros per 100g
- Tap to select → quantity input (grams or servings)
- Add to log

**Pre-Loaded Rutgers Dining Hall Menu:**

- Toggle at top: "Rutgers Dining 🍽️"
- Shows today's dining hall menu items (seeded data)
- Each item has full macro info pre-filled
- One-tap logging

**Post-Log Feedback:**

- Animated XP gain (+50 XP) floats up after logging
- Streak progress updates in real time
- Toast: "Meal logged! You're 80% to your protein goal today."

---

### 4. Team Challenges

**Goal**: Show the core gamification loop — compete with friends, win real rewards.

**Challenge Feed:**

- List of active and upcoming challenges
- Each `ChallengeCard` shows:
  - Challenge name (e.g., "Protein Week", "Clean Eating Cup")
  - Type badge: Solo / Team / Floor vs Floor
  - Time remaining (live countdown)
  - Stakes: e.g., "$10/person pot" or "Winner gets 20% off at Playa Bowls"
  - Current leaderboard snapshot (top 3)
  - Join / View button

**Active Challenge Detail Screen (tap into a card):**

- Header: Challenge name + end date
- Your Team vs Rival Team scoreboard
  - Team names, total score, avatar stack
  - Animated score bar
- Goal stacking section:
  - List of active goals (e.g., Hit daily protein ✅, Log all 3 meals ⏳)
  - Each goal shows points value and completion status
  - "Add Goal" button to stack additional challenges for more points
- Team chat / reaction strip (emoji reactions only for MVP)
- Stakes banner at bottom: prize or discount on the line

**Create Challenge Flow:**

- Name the challenge
- Select goal type(s): Protein target / Calorie goal / Logging streak / All three
- Invite friends (search by username)
- Set duration (3 / 7 / 14 days)
- Optional: Add stakes (freeform text field — "loser buys coffee")

---

### 5. Leaderboard

**Goal**: Make competition visible and motivating.

**Tabs:**

- **Global** — All MacroLeague users (seeded mock data for prototype)
- **Friends** — People you follow
- **My Team** — Within active challenge

**Each row shows:**

- Rank number (1st = gold crown icon, 2nd = silver, 3rd = bronze)
- Avatar with streak ring
- Name + university
- Total weekly score
- Streak count (flame icon)

**Top 3 are featured** in a podium-style card at the top with glow effects.

**Your rank** is pinned at the bottom of the list so you always see where you stand.

Realtime updates via Supabase subscriptions — scores animate when they change.

---

### 6. Profile / Streaks

**Goal**: Show personal progress, achievements, and habit history.

**Top Section:**

- Avatar (upload from camera roll)
- Name, university, member since
- Current streak with large animated flame 🔥
- XP level bar (e.g., "Level 7 — Macro Athlete")

**Stats Grid (2x2):**

- Longest streak
- Total meals logged
- Challenges won
- Total XP earned

**Achievement Badges:**

- Horizontal scroll row of earned badges
- Examples: "7-Day Streak", "Protein King", "First Challenge Win", "Team MVP"
- Locked badges shown in greyscale with requirement tooltip

**Weekly Summary Chart:**

- Bar chart (7 days) showing daily protein vs goal
- Color-coded bars (green = hit goal, orange = close, red = missed)

**Settings shortcut:**

- Edit macro goals
- Notification preferences
- Linked university / dining hall

---

### 7. Rewards / Discounts

**Goal**: Close the loop — consistency earns real-world value.

**My Rewards:**

- Points balance (earned from streaks + challenge wins)
- "Redeem" button

**Available Rewards:**

- Card grid of partner discounts
  - Partner logo + name
  - Discount description (e.g., "20% off any bowl")
  - Points cost
  - Expiry
  - "Unlock" button
- MVP partners (seeded mock data): Playa Bowls, local smoothie shop, campus coffee

**How to Earn (collapsible section):**

- Log a meal: +10 pts
- Hit daily protein goal: +25 pts
- 7-day streak: +100 pts
- Win a challenge: +250 pts

**Reward Detail Modal:**

- Partner info
- Barcode / QR code (mocked for prototype)
- "Show at register" instruction

---

## Database Schema (Supabase / PostgreSQL)

```sql
-- Users
profiles (id, username, university, goal_type, avatar_url, xp, streak_count, longest_streak, created_at)

-- Nutrition
meal_logs (id, user_id, meal_name, calories, protein, carbs, fats, logged_at, photo_url, source)
daily_goals (id, user_id, calories, protein, carbs, fats)

-- Challenges
challenges (id, name, type, goal_types[], duration_days, stakes_text, start_date, end_date, created_by)
challenge_participants (id, challenge_id, user_id, team_name, score, joined_at)
challenge_goals (id, challenge_id, goal_type, target_value, points_value)

-- Social
friendships (id, user_id, friend_id, status)
activity_feed (id, user_id, action_type, metadata, created_at)

-- Rewards
rewards (id, partner_name, description, points_cost, expiry_date, image_url)
user_rewards (id, user_id, reward_id, redeemed_at)
```

---

## Seed Data

Pre-populate for prototype demo:

- 1 demo user account (auto-login for demo mode)
- 10 mock users on leaderboard with varying scores/streaks
- 2 active challenges (one team vs team, one solo streak)
- Rutgers dining hall menu (breakfast/lunch/dinner items with full macros)
- 5 reward partners with mock discounts
- 7 days of meal log history for demo user

---

## Key Interactions & Animations

- **Streak flame**: pulses every 3 seconds, grows larger with streak length
- **Macro rings**: animate from 0 to current value on screen mount
- **XP gain**: floating "+50 XP" text animates up and fades after meal log
- **Leaderboard score update**: row highlights and score ticks up in real time
- **Challenge countdown**: live timer ticking down seconds
- **Reward unlock**: confetti burst (Lottie) when redeeming a reward
- **Tab bar**: active tab has green glow beneath icon

---

## Non-Goals for MVP

- Android build (iOS only for now)
- Real payment processing (stakes are trust-based or freeform text)
- Actual QR code scanning at stores (mocked)
- Full social feed / DMs
- Apple Health / Google Fit integration
- Dietitian review of macro targets

---

## Success Criteria for Prototype

The prototype is successful if a first-time user can:

1. Sign up and set macro goals in under 2 minutes
2. Log a meal via photo scan or search in under 30 seconds
3. Join or view an active team challenge
4. See where they rank on a leaderboard
5. Understand how streaks and XP connect to real rewards

The gamification loop (log → earn XP → streak → win challenge → unlock reward) must be completable end-to-end in the prototype.

---

## Getting Started Commands

```bash
# Install Expo CLI
npm install -g expo-cli eas-cli

# Create project
npx create-expo-app MacroLeague --template blank-typescript
cd MacroLeague

# Install core dependencies
npx expo install nativewind react-native-reanimated react-native-gesture-handler
npx expo install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/stack
npx expo install expo-camera expo-image-picker expo-notifications
npx expo install react-native-svg lottie-react-native

# Supabase
npm install @supabase/supabase-js

# State
npm install zustand

# Start
npx expo start --ios
```

---

## Environment Variables (.env)

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_key
```

## Agent Session Tracker

> Claude Code: Read this section at the start of every session. Update it before ending.

### Current Status

- [ ] Project initialized
- [ ] Supabase project connected
- [ ] Auth flow complete
- [ ] Navigation scaffold complete
- [ ] Home / Dashboard complete
- [ ] Meal Logger complete
- [ ] Team Challenges complete
- [ ] Leaderboard complete
- [ ] Profile / Streaks complete
- [ ] Rewards screen complete
- [ ] Seed data loaded
- [ ] Animations implemented
- [ ] Demo mode working

---

### Last Session

**Date**: —  
**Completed**:

- Nothing yet — first session

**Stopped at**: —

---

### Next Task

> Pick up exactly here next session:

Nothing yet — start with project init and Supabase connection.

---

### Decisions Made

| Decision | Reason |
| -------- | ------ |
| —        | —      |

---

### Blockers / Open Questions

- None yet

---

### Notes for Next Claude Session

## _Claude: update this block at end of every session with anything the next session needs to know._

_Built for: Rutgers University MVP Launch_
_Target: iOS (React Native + Expo)_
_Design vibe: Dark mode, FanDuel/ESPN energy — Eat. Compete. Win._

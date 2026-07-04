# MacroLeague — Current App Map (UI redesign reference)

> Purpose: let another engineer redesign the UI **without breaking behavior**. This documents the navigation graph, every screen's wiring (store/hooks/services + data shapes), every reusable component (with animation details), theme-token usage, and the dark→light flip risks. Nothing here changes code.
>
> Root: `/Users/nityanthmaramreddy/Downloads/MacroLeagueDemo`
> Stack: Expo / React Native, `@react-navigation` (native-stack + bottom-tabs), Zustand store, Supabase backend, `react-native-reanimated` + `react-native-svg` for animation, `lucide-react-native` for icons, Nunito font family.

---

## 1. Navigation graph

### Entry & gating — `App.tsx` (`/App.tsx`)
`index.ts` → `registerRootComponent(wrapWithMonitoring(App))`. `App.tsx` is a **single conditional tree** inside one `<NavigationContainer>`; it does NOT use a router for the top-level gates — it renders one of several roots based on store state.

Loading gate (App.tsx:164): shows a centered `ActivityIndicator` until `fontsLoaded && !loading && tutorialSeen !== null`.

Render decision (App.tsx:172-190), in order:
1. `passwordRecovery` (Supabase `PASSWORD_RECOVERY` event) → **`ResetPasswordScreen`** (`onDone` clears the flag). Overrides everything.
2. else `isAuthenticated`:
   - `isDeactivated` → **`ReactivateAccountScreen`** (account archived for deletion).
   - else `needsOnboarding` → **`OnboardingGoalsScreen`**.
   - else `!tutorialSeen` → **`TutorialScreen`** (`onDone={markTutorialSeen}`).
   - else → **`MainNavigator`**.
3. else (not authed) → **`AuthNavigator`**.

Key mechanics:
- `StatusBar style="light"` is hardcoded (App.tsx:174) — **must flip to `dark`/auto for a light theme.**
- Auth hydration: `supabase.auth.getSession()` on mount + `supabase.auth.onAuthStateChange` listener. On session it calls `login({...})` with **zeroed stats** then immediately `refreshStats()` (hydrates real XP/points/streak + `needsOnboarding`) and `refreshAccountStatus()`.
- Tutorial seen-flag is **per-account** in AsyncStorage: key `ml_tutorial_seen:${userId}` (App.tsx:29).
- `needsOnboarding` becomes false only when goals are set (goal_calories>0) AND a real display name exists (userStore.ts:156).

### AuthNavigator — `src/navigation/AuthNavigator.tsx`
`createNativeStackNavigator`, `headerShown:false`, default `animation:'fade'`. Screens (route names):
| Route | Component | Animation |
|---|---|---|
| `Welcome` | WelcomeScreen | fade |
| `SignIn` | SignInScreen | slide_from_right |
| `SignUp` | SignUpScreen | slide_from_right |
| `ForgotPassword` | ForgotPasswordScreen | slide_from_right |

Param list (`src/navigation/types.ts`): all four are `undefined` (no params). `ResetPasswordScreen` and both onboarding screens are **NOT** in this stack — they are rendered directly by App.tsx.

### MainNavigator — `src/navigation/MainNavigator.tsx`
Outer `createNativeStackNavigator` (`headerShown:false`), stack screens (route names):
| Route | Component |
|---|---|
| `Tabs` | HomeTabs (the bottom-tab navigator) |
| `Rewards` | RewardsScreen |
| `EditGoals` | EditGoalsScreen |
| `RuleSettings` | RuleSettingsScreen |
| `NotificationSettings` | NotificationsSettingsScreen |
| `UniversitySettings` | UniversitySettingsScreen |

Bottom tabs (`HomeTabs`, `createBottomTabNavigator`, `tabBarShowLabel:false`, custom `tabBarStyle`) — **order and icons**:
| # | Tab route | Label shown | Icon (`AppIcon` name) | Notes |
|---|---|---|---|---|
| 1 | `Home` | Home | `home` (House) | |
| 2 | `Leaderboard` | League | `league` → **`RotatingTrophy`** animation | trophy spins in the tab |
| 3 | `Log` | Log | `plus` in a **`RaisedLogButton`** | center raised brand-filled circle, `Shadow.floating`, `marginTop:-18` |
| 4 | `Challenges` | Challenges | `challenges` (Swords) | |
| 5 | `Coach` | Coach | `coach` (MessageCircle) | |
| 6 | `Profile` | Profile | `profile` (UserRound) | |

Tab visuals (MainNavigator.tsx:112-139): `tabBar` height 88, bg `Colors.surface`, `borderTopColor: Colors.border` (red). Active icon/label color `Colors.primary`, inactive `Colors.textSecondary`. `TabIcon` uses `strokeWidth` 2.5 when focused. Raised button border is `Colors.background` (4px) — flip-sensitive.

---

## 2. Screen inventory

Convention across all screens: theme tokens imported from `../../theme` (`Colors, FontFamily, FontSize, Spacing, Radius, Shadow, alpha`). Main/settings screens manually offset the status bar with `paddingTop: 60` (Coach uses `useSafeAreaInsets` instead). Auth/onboarding screens paint a full-bleed `LinearGradient` and set their own `StatusBar style="light"`.

### 2A. Auth screens (`src/screens/auth/*`)

**Shared:** `<StatusBar style="light" />` + full-bleed `LinearGradient colors={['#0A0A0F','#0D0D18','#0A0A0F']}` over `StyleSheet.absoluteFill`; container bg `Colors.background`. Primary CTA = pill (`borderRadius:50`) filled with `LinearGradient colors={[Colors.primary,'#00C96A']}`; **button text/icon color `#0A0A0F`**. Icons via `AppIcon`.

- **WelcomeScreen.tsx** — route `Welcome`, props `{navigation}`. Renders animated hero landing: gradient bg, two pulsing `GlowOrb`s, 18 deterministic floating `Particle`s, gradient logo mark + `AppIcon "bolt"`, "MACROLEAGUE" wordmark, EAT·COMPETE·WIN row, hero copy, CTA block, "Rutgers University MVP" badge. Uses reanimated `FadeInDown/FadeIn/FadeInUp`. Service: `signInWithGoogle` (`lib/auth`), no store. Actions: Google→`handleGoogleSignIn`→`signInWithGoogle()`; "Create Free Account"→`navigate('SignUp')`; "Sign in"→`navigate('SignIn')`. Display-only, no data submitted.
- **SignInScreen.tsx** — route `SignIn`, props `{navigation}`. State: `email, password, showPassword, loading, googleLoading, focusedField`; shake-on-error (`shakeX`). Renders back button, "Welcome back." title, Email + Password (with "Forgot?" link + eye toggle), gradient "Sign In" button, "or continue with" divider, Google button, "Create one" link. Services: `signInWithEmail, signInWithGoogle` (`lib/auth`). Actions: Sign In→`handleSignIn` (validates, `signInWithEmail(email.trim(),password)`, `shake()`+Alert on error); Google→`signInWithGoogle()`; Forgot?→`navigate('ForgotPassword')`. **Submits `{email(trimmed), password}`.**
- **SignUpScreen.tsx** — route `SignUp`, props `{navigation}`. **Multi-step wizard** `step:0|1|2|3` (creds / name+uni / goal / macros) then a `done` success view. Step2 goal grid = `GOALS` (muscle/lose_weight/eat_cleaner/just_track, each `{icon,label,description,accentColor}`; eat_cleaner accent `#00D4FF`). Step3 = 4× `MacroRow` +/− steppers (Calories 1500-4000/50, Protein 50-300, Carbs 50-500 `#00D4FF`, Fats 20-200 `Colors.gold`). Success view = `SuccessCheck` spring animation. Services/libs: `signUpWithEmail, signInWithGoogle` (`lib/auth`); `calculateMacros, validateMacroTargets, GoalType` (`lib/macros`); `updateOnboardingProfile, slugifyUsername` (`profileService`); `useUserStore.getState().refreshStats()` after profile write; `PixelFlame`. Submit (`handleSubmit`): `validateMacroTargets`→`signUpWithEmail(email.trim(),password)`→ **only if `authData.user && authData.session`** `updateOnboardingProfile(user.id, {...})` + `refreshStats()`→`setDone(true)`. **Payload:** `{username:slugifyUsername(name||email.split('@')[0]), displayName:name, university, goalType, goalCalories, goalProteinG, goalCarbsG, goalUnsaturatedFatG}`; local macros shape `{calories,protein,carbs,fats}`.
- **ForgotPasswordScreen.tsx** — route `ForgotPassword`, props `{navigation}`. State `email, loading, sent`. Renders back button, "Reset password." title (subtitle swaps to "if an account exists…" when `sent`), Email field, "Send reset link" gradient button, "Back to sign in". Service `sendPasswordReset` (`lib/auth`). Action `handleSend`: email shape-check, `sendPasswordReset(trimmed)`, always `setSent(true)` (does not reveal account existence). **Submits `{email(trimmed)}`.**
- **ResetPasswordScreen.tsx** — **NOT a route**; component `{onDone:()=>void}` rendered by App.tsx on `PASSWORD_RECOVERY`. State `password, confirm, showPassword, loading` (`MIN_PASSWORD_LENGTH=6`). Renders "New password." + two secure fields + "Update password" gradient button. Services `updatePassword, signOut` (`lib/auth`). Action `handleSave`: length≥6 + match, `updatePassword(password)`, `signOut()` (force fresh login), `onDone()`. **Submits `{password}`** (confirm local-only).

### 2B. Onboarding screens (`src/screens/onboarding/*`)
Same shared gradient/StatusBar as auth, BUT primary gradient is `[Colors.primary, Colors.primaryDeep]` and **button text/icons are `#FFFFFF`** (auth uses `#0A0A0F`).

- **OnboardingGoalsScreen.tsx** — **no props**; rendered by App.tsx when `needsOnboarding`. Steps `0|1|2` (name+uni / goal / macros). `name` pre-filled from `user.name` unless it matches `user_<hex>` placeholder. Macro sliders here use different colors than SignUp: Calories `accent`, Protein `primary`, Carbs `gold`, Fat `success`. Store: `useUserStore` (`refreshStats`, `user`). Libs/services: `calculateMacros/validateMacroTargets`, `updateOnboardingProfile/slugifyUsername`, `supabase.auth.getUser()`, `PixelFlame`. `finish`: requires trimmed display name (else Alert + jump to step 0 — enforces no-placeholder-name gate), `validateMacroTargets`, `updateOnboardingProfile(user.id,{...})`, `refreshStats()` (sets `needsOnboarding=false`→App shows Tutorial). Same payload keys as SignUp.
- **TutorialScreen.tsx** — **no props** except `{onDone}`; rendered after onboarding when tutorial not seen. **Button-driven paging (deliberately not FlatList — must behave identically on web)**, `activeIndex` state, `btnScale` spring on CTA. 5 hardcoded `SLIDES`: welcome(`sparkles`/gold), log(`meal`/success), xp(`bolt`/accent), compete(`challenges`/primary), rewards(`gift`/gold); each `iconBg=${iconColor}20`. Renders back button (index>0), "Skip"→`onDone`, single `SlideView` remounted per slide (FadeIn), `PageDots` (5), gradient CTA "Next"/"Let's Eat". **No store/services — pure presentational.**

### 2C. Main tab screens (`src/screens/main/*`)

**HomeScreen.tsx** — route `Home` (tab), props `{navigation}`; navigates to `Rewards`, `Leaderboard`, `Log`.
- Renders: header greeting + points badge (`user.points/level`, `AppIcon star`)→`Rewards`; hero `Card variant="hero"`→`Leaderboard` (`RotatingTrophy`, `ORDINAL(me.rank)`, `me.score`, rival chase text / "You lead the league" + `crown`); `Card variant="elevated"` wrapping `NutritionScoreCard`; "TODAY'S PROGRESS" `Card` with 4× `MacroProgressBar` (Calories/Protein/Carbs/Unsat.Fat); CTA→`Log` (`nextActionText`, `plus`); `StreakCard streakCount nextMilestone={14}`; `RivalCard` (only if me+rival); "TODAY'S MEALS" `daily.meals.map`→`FoodLogItem`; "RECENT ACTIVITY" `feed.map`→`ActivityFeedItem`.
- Store: `useUserStore` (`user`, `refreshStats()`). Hook: `useDailyTotals(today)`→`{totals,goals,meals,isLoading,error,refresh}`. Services: `getProfileIdentity(user.id)`, `getLeaderboard(14)`, `getRecentActivityFeed(6)`, `getRecentDailyActivity(2)`, `publicLeaderboardName(rival)`. Lib: `computeNutritionScore({calories,proteinG,carbsG}, goals)`→`{score,status}`. All refetched on `useFocusEffect`.
- Data: `LeaderboardUser{userId,rank,score,streakCount,avatarUrl}`; `ActivityFeedEntry{id,icon,text,minutesAgo}`; `totals{calories,proteinG,carbsG,unsaturatedFat{grams,missingCount}}`; `goals{calories,proteinG,carbsG,unsaturatedFatG}`.
- Flip risk: CTA `Shadow.floating` + text `Colors.textPrimary` on `Colors.primary` bg.

**MealLoggerScreen.tsx** — route `Log` (tab), no params.
- Renders: "LOG A MEAL" bar; "TODAY" totals grid of `TotalPill{label,value,goal}` (Cal/Protein/Carbs/Total Fat/Unsat/Sat/Trans, subtypes via `formatSubtype`); "ADD/EDIT MEAL" with Manual/Describe `ModeButton` toggle, `FIELD_CONFIGS` inputs (freeText, calories, proteinG, carbsG, fatG, quantity), `OPTIONAL_FAT_CONFIGS` (sat/trans/unsat), `MEAL_TYPES` chips, Submit ("SAVE/UPDATE MEAL"), cancel-edit; `DescribePanel` with query input + `CandidateCard`s; "CONFIRMED MEALS" `daily.meals.map`→`MealRow` (Edit/Delete); overlay `feedbackToast` + `FloatingXP amount={BASE_MEAL_XP}`.
- Hooks: `useMealLogger()` (`fields,setField,mealType,setMealType,editingId,appliedEstimateName,error,isSubmitting,submit,applyEstimate,beginEdit,cancelEdit,removeMeal`), `useMealEstimate()` (`query,setQuery,estimate,isEstimating,error,candidates,cached`), `useDailyTotals(today)`. Store: `refreshStats`; reads `getState().user?.streakCount` post-submit. Const `BASE_MEAL_XP/BASE_MEAL_POINTS` (`gamificationService`). `handleSubmit`→`logger.submit()`+`daily.refresh()`+`refreshStats()`+XP toast.
- Data: `MealLog` (below); `MealEstimateCandidate{externalId,name,brandName,dataType,servingDescription,confidence,serving{calories,proteinG,carbsG,fatG},components[],assumptions[],warnings[]}`; `FatSubtypeTotal{grams,knownCount,missingCount}`. **Row macro values are per-unit → ×quantity at render.**
- Flip risk: `feedbackToast.shadowColor=Colors.primary`; button/pill text `color: Colors.background` on primary fills.

**ChallengesScreen.tsx** — route `Challenges` (tab). **Param `route.params.inviteFriend={id,name}`** (from Leaderboard) → auto-opens Create modal pre-seeded then clears param. Uses `useNavigation`/`useRoute`.
- Renders: list (loading/error/empty; "CHALLENGE INVITES" cards Accept/Decline; ACTIVE/UPCOMING/COMPLETED sections→`ChallengeCard`; dashed "CREATE CHALLENGE"); `CreateChallengeModal` bottom sheet (name, Type solo/team, Goal `GOAL_OPTIONS` protein/meal_count/streak, Duration 3/7/14, Stakes); `ChallengeDetail` (Back, standings — team "VS" layout or ranked list w/ me-highlight, goals w/ pts, stakes card w/ `RotatingTrophy`, Join / INVITE FRIENDS); `InviteFriendsModal`.
- Services: `listChallenges()`, `getChallengeInvites()`, `getChallengeDetail(id)`, `createChallenge({name,type,goalType,durationDays,stakes})`, `joinChallenge(id,teamName)`, `inviteToChallenge(id,friendId)`, `respondChallengeInvite(inviteId,accept)`, `getFriends()`, `publicLeaderboardName`. Store `user?.id`.
- Data: `ChallengeSummary{id,name,type,goalType,stakesText,durationDays,startDate,endDate,createdBy,status,participantCount,joined}`; `ChallengeDetail` extends + `{standings:ChallengeStanding[],goals:ChallengeGoal[]}`; `ChallengeStanding{userId,username,displayName,avatarUrl,teamName,streakCount,score,rank}`; `ChallengeInvite{inviteId,challengeId,challengeName,goalType,endDate,inviterId,inviterName,createdAt}`.
- Flip risk: **hardcoded `'rgba(0,0,0,0.7)'` modal overlay** (only literal); button text `Colors.background`.

**CoachScreen.tsx** — route `Coach` (tab), no params. **Local chat only — nothing persisted, no store.**
- Renders: `KeyboardAvoidingView` root, header (`AppIcon bolt`, "MacroCoach"), message `ScrollView` (user bubble primary bg / AI bubble elevated + avatar, `TypingDots` while loading, error banner, `SUGGESTED_QUESTIONS` chips only when `messages.length===1`), input bar (multiline TextInput max 500, send button). Uses `useSafeAreaInsets()`.
- Service: `sendChatMessage(history:ChatMessage[])`→reply string. Data: `Message{id,role,content}`; `ChatMessage{role:'user'|'assistant',content}` (id `welcome` filtered from history).
- Flip risk: user-bubble text `Colors.textPrimary` on `Colors.primary`; send button `Shadow.floating`.

**LeaderboardScreen.tsx** — route `Leaderboard` (tab), no incoming params. **Navigates out** `navigate('Challenges',{inviteFriend:{id,name}})`.
- Renders: "LEADERBOARD" header, 3 tabs (`global`/`friends`/`team`, Friends shows pending-request count badge). Global: window chips (`LEADERBOARD_WINDOWS`), `youCard` (YOUR RANK #, score pts), top-3 + rest as `LeaderboardRow{rank,name,points,streak,movement:0,isCurrentUser,avatarUrl}`. Friends (`FriendsTab`): debounced search (`searchUsers`), FRIEND REQUESTS rows (Accept/Decline), search results w/ `StatusButton` (Add/Requested/Accept/Friends), FRIENDS LEADERBOARD standings + "Challenge" button→`onChallengeFriend`. Team: "coming soon" placeholder.
- Store `user`. Services: `getLeaderboard(windowDays)`, `LEADERBOARD_WINDOWS`, `publicLeaderboardName`; `getFriendRequests()`, `getFriendsLeaderboard(14)`, `searchUsers(text)`, `sendFriendRequest(userId)`, `respondFriendRequest(requesterId,accept)`.
- Data: `LeaderboardUser`; `UserSearchResult{userId,username,displayName,avatarUrl,status:FriendshipStatus}`; `FriendRequest` (Friend + `requestedAt`); `FriendStanding` (Friend + `score,streakCount,rank`); `FriendshipStatus='none'|'outgoing'|'incoming'|'friends'`.
- Flip risk: `smallBtnPrimaryText`/challenge-icon use `Colors.background` on primary; literal 🔥 emoji + `✕` glyph.

**ProfileScreen.tsx** — route `Profile` (tab), props `{navigation}`.
- Renders: header (avatar initial `user.name[0]`, name, university, "Member since" from `createdAt`); `StreakFlame size="large"`; XP bar from `user.level/xp` via `getXpForLevel` + `LEVEL_TITLES`; 2×2 stats grid (`longestStreak`, `totalMealsLogged`, `challengesWon`, `xp`); Rewards link (`user.points`)→`Rewards`; horizontal Achievements list from `deriveAchievements` (`{id,icon,unlocked,name,description}`); Weekly Protein bar chart (bars colored vs `dailyGoals.protein`); Settings list; Sign Out; Delete Account. Uses animations `ElectricBolt/RotatingTrophy/ClashingUtensils` in stat/badge icons.
- Store `useUserStore`: `user, dailyGoals`, `logout, refreshStats, setAccountLifecycle`. Services/libs: `signOut` (`lib/auth`), `requestAccountDeletion` (`accountService`), `getRecentDailyActivity(7)` (`activityService`), `LEVEL_TITLES/getXpForLevel` (`lib/leveling`), `deriveAchievements` (`lib/achievements`). `useFocusEffect`→`refreshStats()` + weekly protein build.
- Actions: settings rows→`EditGoals`/`RuleSettings`/`NotificationSettings`/`UniversitySettings`; Sign Out→`signOut()`+`logout()`; Delete→2-step Alert→`requestAccountDeletion()`→`setAccountLifecycle(true,scheduledAt)`.
- Flip risk: opacity-hex composites (`gold+'0D'/'22'`, `primary+'44'`, `error+'44'`); chart bar colors branch primary/accent/error/surface2.

### 2D. Stack (non-tab) main screens

**RewardsScreen.tsx** — route `Rewards`, no params. Store `user`, `adjustPointsLocally, refreshStats`. Services `listRewards, getRedeemedRewardIds, redeemReward` (`rewardService`), `getEarnRules` (`ruleSetService`). Renders back, balance card (`user.points`), confetti overlay, AVAILABLE REWARDS grid of `RewardCatalogItem` cards (icon via `rewardIcon()` on category/partner), collapsible HOW TO EARN (`earnRules{action,points}`), reward detail Modal (QR placeholder, UNLOCK). `handleRedeem`→`redeemReward(id)`→`{newBalance}`→`adjustPointsLocally(delta)`+`refreshStats()`+confetti. Data `RewardCatalogItem{id,partnerName,description,category,pointsCost,expiryDate}`. **Flip risk: hardcoded `'rgba(0,0,0,0.7)'` overlay; UNLOCK text `Colors.background`.**

**EditGoalsScreen.tsx** — route `EditGoals`, no params. Store `dailyGoals, setDailyGoals`. Services `getProfileGoals, updateProfileGoals` (`profileService`) + `supabase.auth.getUser()`. Renders back, 4× `MacroSlider` (+/- stepper): Calories(1500-5000/50 primary), Protein(50-350/5 primary), Carbs(50-500/5 accent), Unsat Fat(20-200/5 gold); QUICK PRESETS (Build Muscle/Lose Weight/Maintain); Save. `save()`→`validateGoals()`→`updateProfileGoals(user.id,{goalCalories,goalProteinG,goalCarbsG,goalUnsaturatedFatG})`→`setDailyGoals({calories,protein,carbs,fats})`→`goBack()`. `fats`=unsaturated only, trans fixed 0. Flip: Save text `Colors.background`.

**RuleSettingsScreen.tsx** — route `RuleSettings`, no params. Store `user?.id`. Services `getActiveRuleSet, saveRuleModules` (`ruleSetService`). Renders back, subtitle (custom vs default via `isOwn`), 4× `RuleRow` `Switch`: `mealCountEnabled`(sub `mealCountRequired`), `proteinGoalEnabled`(sub `proteinMinPct`), `macroAccuracyEnabled`, `streakEnabled`; Save. `save()`→`saveRuleModules(userId,modules)`→`goBack()`. Data `RuleModules{mealCountEnabled,mealCountRequired,proteinGoalEnabled,proteinMinPct,macroAccuracyEnabled,streakEnabled}`. Flip: `Switch trackColor true=Colors.primary+'88'`; Save text `Colors.background`.

**NotificationsSettingsScreen.tsx** — route `NotificationSettings`, no params. **AsyncStorage only** (key `ml_notification_preferences:${userId}`), no Supabase. Store reads `user?.id` only for the key. 5 `Switch` rows: `streakReminder, challengeUpdates, teamAlerts, goalReminders, weeklyReport` (defaults: goalReminders false, rest true). `updatePreference(key,value)`→merge+`AsyncStorage.setItem`. No save button. Flip: `Switch trackColor true=Colors.primary+'44'`.

**UniversitySettingsScreen.tsx** — route `UniversitySettings`, no params. Store `refreshStats`. Data `UNIVERSITIES, getDiningHallsForUniversity` (`data/universityDining`); services `getProfileIdentity, updateProfileUniversity` (`profileService`) + `supabase.auth.getUser()`. Renders back, YOUR UNIVERSITY list (active highlighted + checkmark), PREFERRED DINING HALL list (`hall.name`+`hall.campus`), Save. `save()`→`updateProfileUniversity(user.id,{university,preferredDiningHall})`→`refreshStats()`→`goBack()`. Flip: active row `Colors.primary+'44'`/`+'08'`; Save spinner/text `Colors.background`.

**ReactivateAccountScreen.tsx** — **not a route** (App.tsx gate when `isDeactivated`), no props. Store `deletionScheduledAt`, `setAccountLifecycle, logout`. Services `reactivateAccount` (`accountService`), `signOut` (`lib/auth`). Renders centered `AppIcon hourglass` (accent), "Account scheduled for deletion", `whenText` from `deletionScheduledAt`, REACTIVATE button, "Sign out". REACTIVATE→`reactivateAccount()`→`setAccountLifecycle(false,null)`. Flip: button text/spinner `Colors.background`.

---

## 3. Reusable components (`src/components/**`)

### UI primitives (`src/components/ui/`)
- **AppIcon.tsx** — the app's single vector-icon layer wrapping `lucide-react-native`. Props `{name:AppIconName, size=20, color=Colors.textSecondary, strokeWidth=2, accessibilityLabel}`. `AppIconName` is a fixed key map (~70 semantic names → Lucide icons, e.g. `home→House`, `league/trophy→Trophy`, `challenges→Swords`, `bolt→Zap`, `coach→MessageCircle`). Used everywhere. **PixelFlame is the only game-art exception to this layer.**
- **Avatar.tsx** — `{name, uri?, url?, size=40, ring?}`. Circular avatar: renders `<Image>` only if src matches `^https://` (security), else the name's first initial on `alpha(Colors.primary,0.16)` bg. Optional 2px `ring` border color. Used in LeaderboardRow, RivalCard, ActivityFeedItem, Challenges/Leaderboard rows.
- **Card.tsx** — `{children, variant:'default'|'elevated'|'hero', style, onPress?, accent?, padded=true}`. Base surface primitive: `default` = `Colors.surface` + `Radius.lg` + `Shadow.card`; `elevated` = `surfaceElevated` + `Radius.xl`; `hero` = `surfaceElevated` + `Radius.xxl` + `borderColor:Colors.borderStrong` + `Shadow.hero`. `borderColor: Colors.border` (red) by default; `accent` overrides border color. Used by RivalCard, StreakCard, HomeScreen.
- **Pill.tsx** — `{label, color=Colors.textSecondary, filled?, icon?, style}`. Rounded status chip: tinted `alpha(color,0.14)` by default, solid `color` fill when `filled` (text becomes `Colors.textOnBrand`). Radius `pill`.
- **ProgressBar.tsx** — `{progress(0..1), color=Colors.primary, trackColor=Colors.track, height=10, style, animated=true}`. Generic animated fill bar. **Reanimated**: `width` shared value animates 0→clamped over `Motion.progress` (600ms), `Easing.out(Easing.cubic)`. Rounded track+fill. Used by MacroProgressBar.
- **Countdown.tsx** — `{to(ISO), style, endedLabel='Gameweek over'}`. Live label, re-renders once/minute (`setInterval 60000`). Formats `Xd Yh left` / `Yh Zm left` / `Zm left`. **No animation library** — plain interval + state.
- **RankMovement.tsx** — `{movement, size=FontSize.meta}`. Static trend indicator: `movement>0` green `trend-up` icon + value, `<0` red `trend-down`, `0` muted dash. **No animation.** Used inside LeaderboardRow.

### Domain components (`src/components/`)
- **MacroProgressBar.tsx** — `{label, current, target, unit='g', color?, note?}`. Labeled row (label + `current/target`) over a `ProgressBar`. Fill flips to `Colors.success` when `ratio>=1`. Used on Home "TODAY'S PROGRESS".
- **MacroRing.tsx** — `{label, current, goal, size=72, strokeWidth=6, color?}`. **Reanimated + react-native-svg** radial ring. `strokeDashoffset` animates via `withTiming(ratio,1000ms, Easing.out(cubic))`. Ring color: default primary, `>1` → error, `<0.5` → accent. Center shows `current`.
- **NutritionScoreCard.tsx** — `{score(0..100), delta, status, size=132}`. **The Today hero.** Dual animation: (1) **count-up** 0→score via `requestAnimationFrame` over `Motion.countUp` (700ms, easeOutCubic) — JS-driven because RN can't animate Text content; (2) **arc fill** `strokeDashoffset` via Reanimated `withTiming` same duration. `scoreColor()` bands: ≥80 `#B3B3B3` (Philippine silver, hardcoded), ≥60 primary, ≥40 accent, else error. Delta pill up=silver/down=error.
- **FoodLogItem.tsx** — `{meal: services/mealLogService.MealLog}` (the REAL Supabase row, not `types` MealLog). Renders meal-type icon (breakfast=sunrise/lunch=sun/dinner=moon/snack=apple), `freeText`, time + source badge (`user_estimate→sparkles/estimate`, `usda_fdc→search/USDA`, else `edit/manual`), and macros **×quantity**. Used on Home.
- **ChallengeCard.tsx** — `{name, type:ChallengeType, stakesText, endDate, status, participantCount, joined, onPress}`. Card with type badge (solo=primary / team=accent), live `timeLeft` (own `setInterval` 60000ms, recomputes on prop change), stakes, participant count, "Joined" pill. Used on Challenges list.
- **LeaderboardRow.tsx** — `{rank, name, points, streak, movement, zone?, isCurrentUser?, isRival?, badge?, avatarUrl?, onPress?}`. League-table row: medal icon for rank 1-3 (`MEDAL_COLOR` 1=gold,2=`#BFC5CC`,3=`#C9824A`) else number, embedded `RankMovement`, `Avatar` (ring = brand/gold/accent by role), name (+" (You)"), `badge` or `PixelFlame`+streak, points. Current user tinted `alpha(primary,0.1)`, rival `alpha(accent,0.35)`. Left edge tinted by zone (promotion/relegation/safe).
- **RivalCard.tsx** — `{myName, myPoints, rivalName, rivalPoints, gap, suggestedAction?, onPress?}`. "You're chasing X" `Card` with two `Avatar`s and a **two-sided race bar** (`myShare` flex split, clamped 0.08-0.92), scores, and a suggested-action row. **No animation lib** (static flex bar). Used on Home.
- **StreakCard.tsx** — `{streakCount, nextMilestone?}`. `Card` with a large `StreakFlame` + "N-day streak" + a "protect your streak / X to milestone" nudge. Used on Home.

### Animation components (detailed — redesign must preserve/adapt)

| Component | File | Library | What it animates | Timing / trigger |
|---|---|---|---|---|
| **FloatingXP** | `components/FloatingXP.tsx` | **Reanimated** (`withTiming/withDelay`, `runOnJS`) | "+N XP" text floats up & fades | On `visible` becoming true: opacity 0→1 (200ms), scale 0.5→1 (300ms, `Easing.out(back(2))`), translateY 0→-80 (1500ms cubic), then fade out after 1000ms delay (500ms)→`onDone()`. `animated=false` snaps to static. Triggered after a successful meal log (MealLoggerScreen). |
| **PixelFlame** | `components/PixelFlame.tsx` | **Sprite sheet** (plain `setInterval` + `<Image>` translateX; NO Reanimated) | 6-frame pixel fire sprite (`assets/game-art/streak-fire.png`, CC0) | `setInterval(140ms)` cycles frame 0..5 by shifting the sheet `translateX:-frame*size`. Only animates when `animated` prop true; static frame 0 otherwise. `imageRendering:'pixelated'` on web. Used by StreakFlame, LeaderboardRow, ActivityFeedItem, FoodLog contexts. |
| **StreakFlame** | `components/StreakFlame.tsx` | **Reanimated** (`withRepeat/withSequence/withTiming`) + wraps PixelFlame | Pulsing scale on the flame + count | Infinite pulse scale 1→1.15→1 (800ms each, mirrored). Count text turns `Colors.accent` when `count>=7`. `size:'small'|'large'`. Used by StreakCard + Profile header. |
| **ClashingUtensils** | `components/animations/ClashingUtensils.tsx` | **Reanimated** + **react-native-svg** (`useReducedMotion`) | Silver fork + knife SVGs sweep inward and "clash" with a white flash | `withRepeat` sequence: clash 0→1 (300ms `inOut(cubic)`), back 1→0 (480ms `out(back(1.4))`), 700ms rest. Fork/knife translateX+rotate interpolated; flash dot opacity spikes at clash apex (interp `[0,0.82,1]→[0,0,1]`). Respects reduced-motion (skips). Hardcoded stroke `#C9D0D8`/`#EEF2F5`, flash `#FFFFFF`. Used on Profile (challenges-won badge). |
| **ElectricBolt** | `components/animations/ElectricBolt.tsx` | **Reanimated** + AppIcon (`useReducedMotion`) | Layered XP `bolt` icon with irregular electric pulse + two sparks | `withRepeat` sequence energy 0→1(180ms)→0.35(90ms)→0.9(130ms)→0(620ms). Outline layer (`#70DFFF`) opacity 0.18→0.95 + scale 1→1.16; sparks fade/scale in. Respects reduced-motion. Hardcoded `#70DFFF/#BDF4FF` cyan sparks over `Colors.accent` bolt. Used on Profile (XP stat). |
| **RotatingTrophy** | `components/animations/RotatingTrophy.tsx` | **Reanimated** + AppIcon (`useReducedMotion`) | `trophy` icon does an in-place 3D Y-axis spin with a glint | `withRepeat(withTiming(360,3000ms linear))`. `perspective:320` + `rotateY`. Glint bar opacity pulses at rotation angles (~90°/270°). `color=Colors.gold` default. Respects reduced-motion. Used in **Leaderboard bottom tab icon**, Challenges stakes card, Leaderboard/Profile empty & hero states. |
| **RankMovement** | `components/ui/RankMovement.tsx` | none (static) | — | See UI primitives above. Static up/down/flat indicator. |
| **Countdown** | `components/ui/Countdown.tsx` | none (`setInterval`) | — | See UI primitives above. Text updates once/minute. |

**Note:** All Reanimated components pass explicit dependency arrays to `useAnimatedStyle/useAnimatedProps` — required because web has no Reanimated Babel plugin. Preserve this when refactoring. Timing constants live in `theme.Motion` (`tap:140, progress:600, countUp:700, reward:320`).

---

## 4. Theme usage (`src/theme/index.ts`)

Single design-system module. Direction (per file header): **refined DARK, sporty, one carmine-red brand accent**, gold for rewards/1st, semantic green/orange/red, grayscale surfaces. Consumed via `import { Colors, FontFamily, FontSize, Spacing, Radius, Shadow, Motion, alpha } from '../theme'` (or `../../theme`).

**Colors** (all dark-assumed hex):
- Surfaces: `background #0D0D0D`, `surface #161616`, `surfaceElevated/surface2 #1F1F1F`, `track #262626`.
- Borders (RED per design): `border #7E2630`, `borderStrong #A82C38`.
- Brand/accents: `primary #A8141E` (carmine), `primaryDeep #7C0F18`, `accent #FF8A4C` (orange), `gold #FFC53D`, `success #2FD27A`, `warning #FFB020`, `error/danger #FF5D5D`, zone aliases `promotion/relegation`.
- Text (Philippine silver, NOT white): `textPrimary #B3B3B3`, `textSecondary #8A8A8A`, `textTertiary #5C5C5C`, `textOnBrand #0D0D0D` (dark text for gold/green fills — NOT the red brand).
- `alpha(hex, 0..1)` helper composes 8-digit hex; the codebase also uses the older `Colors.primary + '14'` string-suffix pattern heavily.

**Fonts — Nunito throughout** (loaded in App.tsx via `@expo-google-fonts/nunito`): `FontFamily.displayBold=Nunito_800ExtraBold`, `displaySemiBold=Nunito_700Bold`, `body=400`, `bodyMedium=500`, `bodySemiBold=600`. `FontSize`: hero 56 / display 40 / title 28 / heading 22 / subhead 18 / body 15 / label 13 / meta 11 / micro 10.

**Spacing** (4-based): xs4/sm8/md12/base16/lg20/xl24/xxl32/xxxl40. **Radius**: sm10/md14/lg18/xl24/xxl28/pill999. **Shadow**: `none/card/hero/floating` — `floating.shadowColor = Colors.primary` (brand glow). **Motion**: tap140/progress600/countUp700/reward320.

**How it's consumed:** Main + settings screens are 100% theme-driven (flip lives in `theme`). Auth + onboarding screens bypass the palette with hardcoded gradients/hexes.

---

## 5. Data / store

### `userStore` (`src/store/userStore.ts`, Zustand)
State: `user:UserProfile|null`, `dailyGoals:DailyGoals` (default all-zero `EMPTY_GOALS`), `isAuthenticated`, `isDeactivated`, `deletionScheduledAt:string|null`, `needsOnboarding`.
Actions: `login(user)`, `logout()`, `setAccountLifecycle(deactivated,scheduledAt)`, `refreshAccountStatus()`, `applyStats(ProfileStats)`, `refreshStats()`, `adjustPointsLocally(delta)` (LOCAL-only optimistic; overwritten by next `refreshStats`), `setDailyGoals(goals)`.

`refreshStats()` is the **only** path that mutates XP/points/streak/level — it pulls `getProfileStats + getProfileIdentity + getProfileGoals` in parallel and sets `needsOnboarding = goalCalories===0 || !identity.hasName`.

**`UserProfile`** (the `user` object — bind the redesign to these fields): `id, username, name, email, university, preferredDiningHall?, goalType('muscle'|'lose_weight'|'eat_cleaner'|'just_track'), avatarUrl:string|null, xp, level, streakCount, longestStreak, totalMealsLogged, challengesWon, points, createdAt`.

**`DailyGoals`**: `{ calories, protein, carbs, fats }`.

### Domain types (`src/types/index.ts` — demo/legacy shapes) vs service types (live)
`src/types/index.ts` holds the original demo shapes: `UserProfile`, `DailyGoals`, `MealLog`, `Challenge/ChallengeParticipant/ChallengeGoal`, `LeaderboardEntry`, `Reward/UserReward`, `Achievement`, `ActivityFeedItem`, `DiningHallItem`. **Live screens mostly bind to the richer service types below** (e.g. `FoodLogItem` explicitly uses the service `MealLog`, not the types one).

Key live service types (the ones the UI actually renders):
- **MealLog** (`services/mealLogService.ts`): `id, userId, foodId, freeText, calories, proteinG, carbsG, fatG(total), quantity, mealType('breakfast'|'lunch'|'dinner'|'snack'), eatenAt, clientRequestId, createdAt, updatedAt, source('manual'|'usda_fdc'|'user_estimate'|null), sourceFoodId, confidence, saturatedFatG, transFatG, unsaturatedFatG, fiberG` (subtype grams per single serving; null=unknown).
- **DailyTotals**: `calories, proteinG, carbsG, fatG, mealCount, saturatedFat/transFat/unsaturatedFat: FatSubtypeTotal{grams,knownCount,missingCount}` (coverage-aware).
- **LeaderboardUser**: `userId, username, displayName, university, avatarUrl, score, streakCount, rank`. (Display name via `publicLeaderboardName()` — never show `user_<hex>` placeholder.)
- **ChallengeSummary / ChallengeDetail / ChallengeStanding / ChallengeGoal / ChallengeInvite** (see §2C Challenges).
- **RewardCatalogItem**: `id, partnerName, description, pointsCost, category, expiryDate:string|null`. **EarnRule**: `{action, points}` (rendered), plus `id/userId/...`.
- **ProfileStats**: `xp, points, streakCount, longestStreak, totalMealsLogged, challengesWon, level`. **ProfileIdentity**: `username, displayName, university, goalType, preferredDiningHall, hasName`.
- **ActivityFeedEntry**: `id, icon(AppIconName|'streak'), text, occurredAt, minutesAgo`. **DailyActivityPoint**: `date, calories, proteinG, carbsG, fatG, mealCount`.
- **Friend**: `userId, username, displayName, avatarUrl, university, name`. **FriendStanding** extends + `score, streakCount, rank`. **FriendshipStatus**: `'none'|'outgoing'|'incoming'|'friends'`.
- **RuleModules**: `mealCountEnabled, mealCountRequired, proteinGoalEnabled, proteinMinPct, macroAccuracyEnabled, streakEnabled`.
- **MealEstimateCandidate**: `source, externalId, foodId, name, brandName, dataType, servingDescription, servingGramWeight, confidence, serving:MacroBundle, per100g:MacroBundle` (+components/assumptions/warnings surfaced by MealLogger).
- **ChatMessage**: `{ role:'user'|'assistant', content }`.

---

## Top risks when flipping dark → light

1. **`StatusBar style="light"` is hardcoded** in App.tsx:174 (and every auth/onboarding screen) — light text vanishes on a light bar. Must become `dark`/auto.
2. **Auth + onboarding screens hardcode a near-black `LinearGradient` background** (`['#0A0A0F','#0D0D18','#0A0A0F']`) plus green gradient (`[Colors.primary,'#00C96A']`) and button-text hex (`#0A0A0F` on auth, `#FFFFFF` on onboarding). These 7 screens ignore `Colors` entirely and will stay dark unless individually reworked. (`src/screens/auth/*`, `src/screens/onboarding/*`.)
3. **`Colors.background` / `Colors.textPrimary` used as on-primary text/icon color** on filled primary buttons across MealLogger (submit/toast), Challenges (create/join/invite), Leaderboard (`smallBtnPrimaryText`), Home CTA, Rewards (UNLOCK), EditGoals/RuleSettings/University/Reactivate (Save). If `background` inverts to light, these labels lose contrast on the red fill — introduce an explicit `onPrimary` token.
4. **Opacity-suffixed hex composites assume a dark base** (`Colors.primary + '08'/'10'/'14'/'33'/'44'/'88'`, `Colors.gold + '0D'/'18'/'22'`, `Colors.error + '44'`, plus `alpha()` tints). Their tints will read wrong on light surfaces and need re-tuning. Red `border`/`borderStrong` outlines also assume dark cards.
5. **Brand-tinted shadows/glow + animation hardcodes.** `Shadow.floating.shadowColor = Colors.primary` (Home CTA, Coach send, raised Log tab) and `feedbackToast.shadowColor = Colors.primary` glow oddly on light. Animation components hardcode light-on-dark hexes: `NutritionScoreCard` silver `#B3B3B3`, `ElectricBolt` cyan `#70DFFF/#BDF4FF`, `ClashingUtensils` `#C9D0D8/#EEF2F5/#FFFFFF` flash, `RotatingTrophy` glint `#FFF8D8`, `LeaderboardRow` medal `#BFC5CC/#C9824A`. Plus one literal `'rgba(0,0,0,0.7)'` modal overlay (ChallengesScreen, RewardsScreen).

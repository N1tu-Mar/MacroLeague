# MacroLeague — Interactions & Motion (02)

Sources: `MacroLeague Prototype.dc.html` (flows, navigation wiring, sheets, JS `Component` logic) and the Motion/Redline/A11y frames of `MacroLeague Screens.dc.html`. Screen numbers reference `01-screens.md`.

---

## 1. Navigation model

### Bottom tab bar (`showTabs`)
Visible only on the four main destinations: **Today · League · Challenges · Coach**. Structure (left→right):
1. **Today** — house icon, label "Today"
2. **League** — trophy, "League"
3. **[Raised Log FAB]** — 54px scarlet circle, plus icon, `margin-top:-24px`, shadow `0 8px 20px rgba(217,54,74,.35)`, 4px canvas-colored border. Opens the Log sheet (`openLog`), not a tab.
4. **Challenges** — swords, "Challenges"
5. **Coach** — message-circle, "Coach"

Active tab tinted `#D9364A`; inactive `#9AA1AB` (`navTodayC`/`navLeagueC`/`navChalC`/`navCoachC` swap on `screen`). Below the bar: white strip + home indicator 134×5.
**Profile is NOT a tab** — it opens from the Today header avatar. Settings opens from Profile's gear; Rewards from Profile's menu; Reactivate is reached via Settings → Delete → confirm.

Android (D1): the FAB is replaced by an inline **Log** plus-circle tab (5 equal tabs) and the active tab shows a pill indicator; back is a system gesture.

### Screen registry (prototype `screen` state)
`welcome, signin, signup, onb1..onb4, today, league, challenges, coach, estimating, results, review, manual, success, createChallenge, challengeDetail, profile, rewards, pass, settings, reactivate`.

### Key navigation wiring (onClick handlers)
- Welcome: Get started / Continue with Google → `goSignup`; "Sign in" → `goSignin`.
- Sign in: Sign in → `goTodayReturning` (resets to Today, existing user); "Create an account" → `goSignup`; back → `goWelcome`.
- Create account: Continue → `goOnb1`.
- Onboarding: Continue chains `goOnb2 → goOnb3 → goOnb4`; "Enter MacroLeague" → `enterApp` (Today). Each back steps to the prior screen; goal cards call `g.pick` (sets obGoal + preset targets); target steppers mutate tCal/tPro/tCarb/tFat.
- Today: avatar → Profile; Log meal / FAB → `openLog`; league snapshot → League; challenge card → detail.
- League: Global/Friends tabs → `setGlobal`/`setFriends`; friend row → `openFriend` (friend sheet).
- Friends/League friend row "Challenge" → friend sheet → `goCreate`.
- Create challenge: Create → `createChallenge` (validates name; on success sets `myChallenge`, screen=challengeDetail).
- Profile: gear → `goSettings`; Rewards row → `goRewards`.
- Rewards: reward → `redeemSheet`; Redeem → `confirmRedeem` (balance −400, screen=pass).
- Settings: Delete account → `openDelete` (sheet); Cancel → `closeDelete`; Confirm → screen=reactivate.
- Reactivate: Reactivate account → `confirmReact` (reset → Today); Sign out → `goWelcome`.

---

## 2. The six prototype flows (A–F)

Entered from the pill launcher; each resets state via `resetCommon()` then sets a starting screen.

- **A · New account** (`flowA`): Welcome (newUser=true, blank email/pw) → Get started → **Create account** → **Onboarding 1–4** (identity → goal → targets → competition) → **Enter MacroLeague** → **Today empty** (new-user). First confirmed meal puts you on the board.
- **B · Log a meal** (`flowB`): Today (returning) → FAB → **Log launcher sheet** → type description → Continue → **Estimating** (staged) → auto-advance to **Results** → recommended → **Review** → **Log {mealType}** → **Success**. Log twice in one session and your rank actually moves (LP +10 each, `rankOf` recomputes).
- **C · Fix an estimate** (`flowC`): jumps straight to **Results** (description prefilled) → recommended or alt card → **Review** → adjust servings (±0.5) / calories (±20) / expand details → **Log** → **Success**. Values recompute live.
- **D · Compete** (`flowD`): **League** → tap Maya (rival) → **Friend profile sheet** → **Challenge Maya** → **Create challenge** → name it → **Create** → **Challenge detail** (just-created group standing).
- **E · Rewards** (`flowE`): **Profile** → Rewards → **Rewards catalog** → Free smoothie → **Reward detail sheet** → **Redeem for 400 LP** → **Redemption pass** (balance now 80 LP).
- **F · Account recovery** (`flowF`): opens **Reactivation** screen (scheduled-deletion) → **Reactivate account** → Today, everything restored. (Full path from within app: Settings → Delete account sheet → confirm → Reactivation.)

Prototype summary string (verbatim): "A Welcome → sign up → onboarding → empty Today · B Today → describe → estimate → review → success · C results → adjust servings/calories → details → confirm · D League → challenge Maya → create → detail · E Profile → Rewards → redeem → pass · F scheduled-deletion → reactivate. Log twice in one session and your rank actually moves."

---

## 3. Sheets & modals

All bottom sheets share: full-screen scrim `.dim` (bg `rgba(23,26,31,.38)`, `fadein .2s`, tap-to-close) + `.sheet` (bg `#F9FAF8`, radius `24 24 0 0`, shadow `0 -12px 40px rgba(23,26,31,.22)`, `rise .3s cubic-bezier(.2,.8,.2,1)`). Each opens with a 40×5 grab handle.

| Sheet | Trigger | Close | Notes |
|---|---|---|---|
| Log meal launcher | FAB `openLog` | X / scrim `closeLog` | mealType inferred (Breakfast if new-user, Snack if dinner logged, else Dinner); Continue enabled only when `hasDesc` |
| Friend profile | friend row `openFriend` | scrim `closeFriend` | public stats only; "Challenge {name}" → `goCreate` |
| Reward detail | reward tap `redeemSheet` | Not now / scrim `closeRedeem` | shows Balance after; Redeem → pass |
| Delete account | Settings row `openDelete` | Cancel / scrim `closeDelete` | destructive; confirm → reactivate |
| Log success | after `confirmMeal` | Done / View today (`dismissSuccess` → Today) | full-screen scrim; sheet itself `rise .3s`; check/trending-up icon `pop .4s` |

Success sheet variant logic (`confirmMeal`): computes prevLP/prevRank, newLP=+10, newRank, whether a rival was passed, first-ever vs streak-secured, score line, protein-left line. `sucMoved` → trending-up + before→now card (+ passed-rival block); `sucUnmoved` → green check + "unchanged". No auto-dismiss (persists until acted on).

---

## 4. Keyframe animations (exact CSS)

Defined across both files. Screens file declares `shimmer, spin, typing, flame`; Prototype declares `spin, flame, rise, pop, fadein`.

```css
@keyframes shimmer { 0% { background-position:-400px 0 } 100% { background-position:400px 0 } }
@keyframes spin    { to { transform:rotate(360deg) } }
@keyframes typing  { 0%,60%,100% { opacity:.25; transform:translateY(0) } 30% { opacity:1; transform:translateY(-3px) } }
@keyframes flame   { to { background-position:-144px 0 } }
@keyframes rise    { from { transform:translateY(24px); opacity:0 } to { transform:translateY(0); opacity:1 } }
@keyframes pop     { 0% { transform:scale(.6); opacity:0 } 70% { transform:scale(1.08) } 100% { transform:scale(1); opacity:1 } }
@keyframes fadein  { from { opacity:0 } to { opacity:1 } }
```

Note the Screens-file skeleton shimmer gradient is `background-size:800px 100%` and `animation:shimmer 1.4s linear infinite` (the keyframe uses ±400px). The Prototype `.btnp` press affordance is a CSS transition (not a keyframe): `transition:transform .1s, filter .15s; :active { transform:scale(.97); filter:brightness(.92) }`.

### Where each keyframe is used
| Keyframe | Duration / timing | Used on |
|---|---|---|
| `shimmer` | 1.4s linear infinite | Loading skeletons — Today skeleton (7b), Estimating result placeholder, hero value block |
| `spin` | .8s (buttons) / 1s (estimating) linear infinite | Button loading spinner (`0.8s`), Welcome "Connecting…", Sign in "Signing in…", Estimating active-step ring (`1s`) |
| `typing` | 1.2s infinite, staggered 0 / .2s / .4s | Coach typing indicator (three dots) |
| `flame` | .6s `steps(6)` infinite | Streak-fire pixel sprite (6-frame, 100ms/frame) — streak pill, Today header, success "streak secured", profile, challenges. Pauses / freezes on frame 1 under reduced motion |
| `rise` | .3s `cubic-bezier(.2,.8,.2,1)` | Bottom-sheet entrance (all sheets + Log success). Also welcome preview "rises 8px while fading" on entry |
| `pop` | .4s (spring, overshoot to 1.08) | Log-success icon (check / trending-up) |
| `fadein` | .2s | Scrim (`.dim`) appearance |

---

## 5. Motion & haptic annotations (frame M1)

| Element | Motion / haptic |
|---|---|
| Curves | standard `cubic-bezier(.2,.8,.2,1)` 250ms · sheets spring damping .85 · never linear |
| Screen push | iOS native slide; Android shared-axis X, 300ms |
| Log sheet | rises 350ms spring, dim to `rgba(23,26,31,.38)` · haptic: light impact on open |
| Estimating steps | each step check fades + scales .8→1, 200ms · no haptic (ambient) |
| Log success | check pops (spring, overshoot 1.08) · XP/LP chips stagger in 80ms apart · haptic: success notification |
| Rank change | #5→#4 numeral rolls vertically 450ms · haptic: medium impact · you-row briefly flashes brand/tint (`#FBEAEC`) in the league table |
| Streak flame | 6-frame pixel sprite, 100ms/frame, loops · pauses with reduced motion |
| Progress bars | fill on first appear only, 400ms, from 0 · no re-animation on tab return |
| Steppers | haptic: selection tick per increment · value crossfades 120ms |
| Score number | counts up 400ms on load (renders final value under reduced motion) |
| Reduced motion | all transforms → 150ms opacity fades; count-ups render final value; sprite freezes on frame 1 — nothing loses function |

---

## 6. Interaction rules & data behavior (from JS logic)

- **Scoring:** each confirmed meal = +50 XP, +10 LP. Editing a meal does not re-earn. LP: `youLP = (newUser?0:196) + session.length*10`. Rank = 1 + count of others with higher LP. Others (fixed): Priya 268, Diego 241, Maya 214 (rival), Jordan 169, Alex 154, Emma 131.
- **Nutrition score:** returning user `min(92, 78 + n*6)`; new user `min(70, 46 + n*8)`; null (em-dash) before first meal.
- **Targets by goal preset:** muscle 2300/170/260/38 · lose 1900/150/190/32 · clean 2100/140/240/40 · track 2000/130/230/35.
- **Stepper bounds:** kcal ±50 (min 1200); protein ±5 (min 60); carb ±5 (min 80); fat ±2 (min 15); servings ±0.5 (0.5–4); manual quantity ±1 (min 1).
- **Review recompute:** revCal = round(620×servings) + calAdj (calAdj steps ±20); revPro = round(46×servings); revCarb = round(68×servings); revFat = round(18×servings); unsat = round(fat×0.72); sat = round(fat×0.22).
- **Manual meal:** "Protein oatmeal", cal = 450×qty, protein = 32×qty.
- **Meal-type inference:** dinner-already-logged → "Snack"; new user with no meals → "Breakfast"; else "Dinner".
- **Estimating timing:** stage2 at 900ms, stage3 at 1800ms, results at 2500ms (timeouts cleared on cancel/unmount; cancel keeps the draft).
- **Rewards:** balance starts 480; smoothie 400 LP → balance 80 after redeem; gym pass 250 LP.
- **Draft safety:** cancel/estimate-error preserves the typed description exactly; challenge-name error preserves all other field values (inline error, never a system alert).
- **Privacy:** public leaderboard shows display name, avatar, university, streak, LP only — never private meal details (repeated in onboarding, friend sheet, coach).

---

## 7. Runtime notes (ignore for rebuild)
`support.js` / `l-icon.js` / the `dc-runtime` and `{{ }}` / `sc-if` / `sc-for` bindings are prototype-renderer mechanics only. `l-icon name="x"` = Lucide icon "x". Avatars are DiceBear micah SVGs (`https://api.dicebear.com/9.x/micah/svg?seed={Name}&backgroundColor={hex}`) — in production replace with real user avatars but keep the per-person background tints for identity continuity.

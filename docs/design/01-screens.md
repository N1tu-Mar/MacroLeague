# MacroLeague — Screen Inventory & States (01)

Every screen and state from `MacroLeague Screens.dc.html`, in section order. Device frame 390×844, status bar 47px (9:41 / signal·wifi·battery-full), home indicator 134×5 `#171A1F` @.18. Screen padding 20px unless noted; auth/onboarding use 22px. Tokens referenced by name are defined in `00-foundations.md`.

Standard header pattern on stacked screens: 44×44 back button (white, `1px #E3E6E0`, radius 14, `chevron-left`) + title (DM Sans 700/20 −.015em).

---

## AUTH — Welcome · Sign in · Create account

### 1 · Welcome (default) — `s1`
Product-led; the preview card does the selling. Layout top→bottom:
- Brand row: 30px shield logo (ink shield, Barlow "ML" in scarlet) + "MacroLeague" (700/17) / "Nutrition leagues for friends" (`#68707D` 500/11).
- Headline: "Track your food." + "Climb your league." (second line `#D9364A`), DM Sans 700/40/1.12, −.025em.
- Sub: "Log meals, hit your nutrition targets, and compete with friends." (400/16/24 `#68707D`, max 310px).
- **Preview card** (white, radius 20, shadow `0 10px 30px /.10`, pad 18/20/16): overline "NUTRITION SCORE" + "Strong day" (`#1E9E5A` 600/14); big **78** (Barlow 700/56/0.9). Protein row "128 / 170g" with h8 bar 75% `#171A1F`. Divider, then "#4" (Barlow 700/20 scarlet) + "18 pts behind Maya" + Maya avatar + "2D 8H LEFT" (Barlow 600/12 `#68707D`).
- Floating pill (overlaps card bottom −18px, white, radius 99, shadow `0 6px 18px /.12`): green check circle + "Chicken rice bowl logged" + "+50 XP" (green) + "+10 LP" (scarlet).
- Actions (bottom): **Get started** primary h54; **Continue with Google** (white/border, Google glyph); "Already have an account? **Sign in**" (`#68707D`, Sign in scarlet 600); legal microcopy "By continuing, you agree to the Terms and Privacy Policy." (`#9AA1AB` 12, underlined links).
- Motion: brand+headline fade 250ms; preview rises 8px while fading; no stagger on auth actions.

### 1b · Welcome — Google connecting — `s1b`
"Get started" dims to opacity .4; Google button shows 16px spinner + "Connecting…" text `#68707D`; sign-in link greyed `#B7BCC3`. Other actions ignore taps while auth in flight; text never becomes bare spinner.

### 2 · Sign in (default) — `s2`
Back button; H1 "Welcome back" (700/30 −.02em); sub "Keep your streak and league progress moving." Fields: Email (filled `nityanth@osu.edu`), Password (`••••••••••`, eye toggle). "Forgot password?" right-aligned `#D9364A` 600/13.5. Actions: **Sign in** primary; **Continue with Google**. Footer "New here? **Create an account**".

### 2b · Sign in states — `s2b`
Three stacked mini-states, each under an overline label:
- **Inline validation:** Email field error border `#C43D3D`, value `nityanth@osu`, message "Enter a valid email address." (circle-alert + `#C43D3D`).
- **Signing in:** primary button with spinner + "Signing in…".
- **Authentication error:** banner (bg `#FBEAEC`, `1px #F2D4D8`, radius 14) circle-alert `#A8141E` + bold "That email and password don't match." + "Try again, or reset your password. Your fields are kept as typed." (`#8A4A52`).

### 2c · Create account — `s2c`
Back; H1 "Create your account"; sub "You'll set your league identity in the next step." Email (placeholder `you@university.edu` `#9AA1AB`); Password (focused: ink border + ring, `••••••••`, eye-off). Strength meter: 2/3 segments green + "Good" (`#1E9E5A`). **Continue** primary. Legal microcopy footer.

---

## ONBOARDING — 4 steps, one question each

Shared header: back + 4-segment progress bar (filled `#D9364A`, empty `#E3E6E0`) + "N / 4" (Barlow 600/12 `#68707D` .06em). Bottom **Continue** primary (step 4 = "Enter MacroLeague").

### 3 · Step 1 — Identity — `s3`
H1 "What should your league call you?" (700/28/1.2). Fields: Display name (focused, "Nityanth"); University dropdown "Ohio State University" (chevron-down). **"WHAT THE LEAGUE SEES" card** (white, radius 16): eye icon + label; inset leaderboard row on `#F5F6F3` — rank "4", 32px avatar, "Nityanth" / "Ohio State", 14px streak "7", "196 LP". Caption: "The public leaderboard shows your display name, avatar, university, streak, and League Points — never your private meal details."

### 4 · Step 2 — Goal — `s4`
H1 "What are you working toward?" `radiogroup` of 4 cards (radius 16). Selected card: `2px #D9364A` border, icon tile `#FBEAEC`/scarlet, filled scarlet check circle. Others: `1.5px #E3E6E0`, tile `#EDEFEA`/`#68707D`, empty radio.
- **Build muscle** (dumbbell) — "Higher protein and calorie targets to support training." (selected)
- **Lose weight** (trending-down) — "A steady calorie deficit while keeping protein high."
- **Eat cleaner** (leaf) — "Balanced targets that reward whole-food choices."
- **Just track** (notebook-pen) — "Neutral targets — see your patterns without pressure."

Presets (from prototype): muscle 2300/170/260/38; lose 1900/150/190/32; clean 2100/140/240/40; track 2000/130/230/35 (kcal/protein/carb/fat).

### 5 · Step 3 — Targets — `s5`
H1 "Your daily targets"; sub "Recommended for building muscle. You can edit these anytime in Settings." Target card (white, radius 16, rows divided by hairline), each row: label (`#68707D` 12.5) + Barlow 700/32 value + unit + minus/plus 36px steppers:
- Calories **2,300** kcal · Protein **170** g · Carbohydrates **260** g · Unsaturated fat **38** g.
- **"Where your calories come from"** card: 10px stacked bar Protein 30% `#171A1F` / Carbs 45% `#9AA1AB` / Fat 25% `#D5D9DE`, with legend swatches + percentages, total "2,300 kcal".
- Note: discrete steppers, not fake sliders (±50 kcal, ±5g).

### 6 · Step 4 — Competition intro — `s6`
H1 "Every meal moves you up"; sub "Confirmed meals earn XP for your level and League Points for your rank." Annotated preview card (white, radius 20, shadow `0 10px 30px`): step ① meal row "Chicken rice bowl" "Logged 12:47 PM · 620 kcal"; arrow-down; step ②③ two tiles "+50 XP" (green, "Levels up your profile") / "+10 LP" (scarlet, "Scores in your league"); arrow-down; step ④ mini leaderboard Maya #3 "214 LP" and You #4 "196 LP" (you-row `#FBEAEC`, 3px scarlet left border) + "4 · your rank" tag. CTA **Enter MacroLeague**. Note: replaces the old 5-page tutorial; further education is contextual.

---

## TODAY — Default · Empty · Loading/Edge

### 7 · Today (default) — `s7`
Full scroll. Header row: "Good afternoon, Nityanth" (700/21 −.015em) + "Today, Jul 3" + chevron-down; streak pill "7"; LP pill "480"; 36px profile avatar (opens Profile — NOT a tab).
- **Nutrition hero** (white, radius 20, shadow `0 6px 20px /.08`): overline "NUTRITION SCORE"; **78** (Barlow 700/72/0.85) + "/100" (Barlow 600/20 `#9AA1AB`); right: "Strong day" pill (`#1E7A48`/`#E3F2E9`) + "↑ Up 6 from yesterday" (`#1E9E5A`). Calories row "1,640 / 2,300 kcal" + h12 bar 71% `#171A1F`. Macro rows: Protein 128/170g (h6 bar 75% `#D9364A`), Carbs 184/260g (71% `#9AA1AB`), Unsaturated fat 24/38g (muted, text only). Recommendation banner (`#FBEAEC`, target icon `#A8141E`): "**42g protein left** — log dinner to stay on pace." (`#7C2A33`). **Log meal** button h50 scarlet + plus icon.
- **2-week league snapshot** (white, radius 16): overline "2-WEEK LEAGUE" + "2D 8H REMAINING" (Barlow 700/13, clock). Rows (rank / avatar / name / movement / LP): 3 Maya ↑1 214 LP; **4 Nityanth [YOU]** (you-row `#FBEAEC`, 3px scarlet border) 196 LP; 5 Jordan ↓2 169 LP. Footer: "18 pts behind Maya · 27 ahead of Jordan" + overlapping avatar stack (Priya/Diego/Alex +5) + chevron-right.
- **Today's meals**: heading + "1,040 kcal logged". Card rows: Greek yogurt bowl (egg-fried tile) Breakfast·8:12 AM, 420 kcal / 28g protein, ellipsis; Chicken rice bowl (salad tile, USDA badge) Lunch·12:47 PM, 620 kcal / 46g, ellipsis; **Add dinner** slot (dashed plus tile) "Usually around 7 PM" + **Repeat** pill (rotate-ccw).
- **Protein Push** challenge card: name + "GROUP · 8" tag + "#2 OF 8" (Barlow scarlet) + chevron. "128 / 150g today" · "Day 4 of 7 · 8h left today"; h8 bar 85% `#D9364A`.
- **Friend activity** card: Maya "moved into 3rd" (1h ago); Jordan "completed a 7-day streak" (3h ago, flame reaction lit `#E86A33`/`#FBEFE8`); Alex "joined Protein Push" (Yesterday). Each row has a flame react button (32px, `#F5F6F3` idle / `#FBEFE8` active).
- **Bottom nav** (see `02` for structure): Today (active scarlet, house) · League (trophy) · [raised scarlet FAB plus] · Challenges (swords) · Coach (message-circle). Profile opens from avatar, not a tab.

### 8 · Today — new-user empty — `s8`
Header without streak/LP chips (they don't exist yet). Hero centered: overline; big em-dash **—** (Barlow 72 `#D5D9DE`); "Log your first meal to start today's score."; "Confirmed meals earn **50 XP** and **10 League Points**." (XP green, LP scarlet); **Log meal** button. "Today's targets" card at .75 opacity: Calories 0/2,300, Protein 0/170, Carbs 0/260 (empty tracks). League teaser card (trophy tile): "2-week league" / "You'll enter the standings after your first confirmed meal." Note: no grid of zeros, no premature streak/LP chips.

### 7b · Today — loading skeleton + edge states — `s7b`
Shimmer skeletons (`linear-gradient(90deg,#E8EAE5 25%,#F2F3EF 50%,#E8EAE5 75%)`, `shimmer 1.4s linear infinite`) for header, hero (52×96 value block, bars), and 2 friend rows. Below a dashed divider:
- **Edge — long display name:** "Good afternoon, Alexandra Konstantinopoulos" truncates with ellipsis; chips (streak "124") and avatar never shrink (`flex:none`).
- **Edge — large value + offline:** Calories "12,480 / 2,300 kcal" value in `#C43D3D`; offline banner (bg `#171A1F`, wifi-off, white): "You're offline. Meals save locally and sync later."

---

## LOG FLOW — Launcher · Estimating · Results · Review · Manual · Success

### 9 · Log meal — launcher sheet — `s9`
Bottom sheet over dimmed Today. Grab handle; "Log a meal" (700/22) + close X (36px `#EDEFEA`). Segmented control **Describe** (active) / Manual. "Logging **Dinner** ▾  inferred from time" (meal type inferred; prototype: Breakfast if new-user, Snack if dinner already logged, else Dinner). Focused textarea (ink border+ring, min 88–104px) placeholder: `Describe what you ate — e.g. "grilled chicken breast, rice, broccoli, and olive oil"`. "USUAL FOR DINNER / THIS TIME" list: Salmon, rice & greens (680 kcal · 42g · logged 6×) + Repeat; Turkey wrap + apple (540 kcal · 38g · last Tue) + Repeat. **Continue** disabled (`#EDEFEA`/`#AEB4BC`) until text exists, then scarlet. No camera/barcode (not in production).

### 10 · Estimating — staged progress — `s10`
"Estimating your meal" + cancel X (cancel keeps draft). Quoted description echoed (quote icon). Three-step vertical tracker connected by 2px `#E3E6E0` links: ① "Finding nutrition matches" done (green check circle); ② "Estimating portions" active (24px scarlet-top spinner `spin 1s`); ③ "Preparing your review" pending (empty ring, `#9AA1AB` text). Below: shimmer result-card placeholder. Prototype timing: stage2 @900ms, stage3 @1800ms, → results @2500ms. Steps are real stages, not a fake percentage.

### 10b · Estimate failed — draft preserved — `s10b`
48px `#FBEAEC` tile with circle-alert `#A8141E`. "We couldn't estimate that meal." + "Something went wrong on our side. Your description is saved exactly as you typed it." Quoted description card. **Try again** (scarlet) + **Enter manually** (secondary).

### 11 · Estimate results — one recommended — `s11`
Header back + "Choose an estimate" + quoted description (truncates). 
- **Recommended card** (`2px #D9364A`, radius 18): "RECOMMENDED" tab badge (white on scarlet, top −11px). "Chicken rice bowl" (700/17) / "5 oz chicken · 1.25 cups rice · vegetables · oil"; **620** KCAL (Barlow 30). Three macro tiles (`#F5F6F3`): 46g Protein / 68g Carbs / 18g Fat. Badges: "Composite estimate" + "Medium confidence". **Assumptions** list: "Approximately 5 oz grilled chicken." / "Approximately 1.25 cups cooked rice." / "One tablespoon olive oil." Warning callout (`#F7EFD8`): "Oil amount strongly affects calories — adjust if you used more." **Use this estimate** h48 scarlet.
- Alt card 1: "Grilled chicken plate, larger portion" 7 oz/1.5 cups, **790** KCAL / 58g P, "Composite" + "Low–medium confidence".
- Alt card 2: "Chicken & broccoli, no rice" "If the rice was a side you didn't eat", **340** KCAL / 44g P, "USDA match" + "High confidence".
- Footer: "None of these? **Enter manually**". Note: plain-language confidence, never "83.42%".

### 12 · Review & confirm — details expanded — `s12`
Header back + "Review meal" + "Breakfast ▾" chip + time "9:41 AM" (prototype shows current mealType). Hero card (white, radius 20, shadow): meal name "Chicken rice bowl" (700/18) + edit pencil (34px `#F5F6F3` tile). "Servings" + stepper group (minus / value / plus). **620** (Barlow 700/56/0.9) "kcal" + edit-calories pencil. Three editable macro tiles (46g Protein / 68g Carbs / 18g Total fat), each with corner pencil. **More nutrition details** (expandable, chevron): Saturated fat 4g, Trans fat 0g, Unsaturated fat 13g, Source = "Composite estimate"; grey note "Assumes 5 oz chicken, 1.25 cups rice, 1 tbsp oil. Fiber and sodium are unavailable for one component, so they're not shown." Below card: shield-check "Estimated from USDA data. Review portions before logging." Actions: **Log breakfast** (dynamic "Log {mealType}") scarlet + **Edit manually** secondary. Prototype: servings/calAdj recompute values live (revCal = 620×servings + calAdj·20; revPro=46×servings; unsat=fat×.72, sat=fat×.22).

### 13 · Manual entry — `s13`
Header back + "Add meal manually". Fields: Food name "Protein oatmeal"; two rows of paired inputs with unit suffixes — Calories 450 kcal / Protein 32 g; Carbohydrates 58 g / Total fat 12 g. "Quantity" + stepper (1); meal-type chip "Breakfast ▾". "Fat breakdown — optional" collapsible + hint "Saturated, trans, and unsaturated fat — add them if the label lists them." **Save meal** scarlet. Numeric fields open number pad. Prototype: manCal = 450×qty, manPro = 32×qty.

### 14 · Log success — ordinary — `s14`
Bottom sheet over dimmed screen. Grab handle; 56px `#E3F2E9` check circle. "Breakfast logged." (700/22). "+50 XP" (green) + "+10 LP" (scarlet) badges. Summary card: Nutrition Score "78 · up 6"; Protein remaining "42g"; League rank "#4 — unchanged". **Done** (scarlet) + **View today** (ghost scarlet). Note: no confetti, no implied movement when rank unchanged.

### 14b · Log success — rank moved + streak secured — `s14b`
56px `#FBEAEC` circle with trending-up `#D9364A`. "Dinner moved you into 4th." "+50 XP / +10 LP". **Before→Now card**: "#5" (Barlow 30 grey, "BEFORE") → arrow-right → "#4" (Barlow 38 scarlet, "NOW") + divider + Jordan avatar "Passed Jordan" / "now 27 pts back". Streak strip (`#FBEFE8`, animated flame): "7-day streak secured." **Done** + **View today**. Prototype dynamic copy: `sucRankLine` = "You moved to {ord}." / first-ever "You're on the board — {ord} of 7." / else "#{n} — unchanged". `sucStreak` only for returning user's first log of session.

---

## LEAGUE & FRIENDS — Standings · Empty · Friends · Search · Requests

### 15 · League — standings — `s15`
Header "League" (700/26) + info button (how scoring works). Segmented **2 Weeks** / 3 Weeks / 1 Month + "2D 8H" clock. **Dark rank summary** (bg `#171A1F`, radius 18): "YOUR RANK" + **#4** (Barlow 700/44 white); right column "League Points 196 LP", "↑ To Maya (#3) 18 pts" (up arrow `#2FD27A`), "↓ Jordan (#5) behind 27 pts" (down arrow `#FF8A8A`). Tabs: **Global** (active, 2.5px scarlet underline) / Friends. **Standings table** (white, radius 16, rows divided `#F0F1ED`, a real sports table):
1 Priya (crown `#B7791B`, gold ring) OSU · streak 21 · 268 LP · — 
2 Diego (silver ring) · 12 · 241 LP · ↑1
3 Maya (bronze ring, RIVAL target badge) · 9 · 214 LP · ↑1
**4 Nityanth [YOU]** (you-row `#FBEAEC` + 3px scarlet border) · 7 · 196 LP · ↑1
5 Jordan · 7 · 169 LP · ↓2
6 Alex (Michigan) · 3 · 154 LP · —
7 Emma · "no streak" · 131 LP · ↓1
Note: movement arrows only where real data exists (dash otherwise). No promotion/relegation zones. Rank numerals colored by place. Bottom nav with League active.

### 15b · League — empty — `s15b`
Header + info. Centered empty card: 52px `#EDEFEA` trophy tile; "No standings yet."; "Log and confirm your first meal to enter this 2-week window. Every confirmed meal earns 10 LP." **Log meal** button.

### 16 · Friends — leaderboard + requests — `s16`
Header "Friends" + search button with red badge "2". **REQUESTS · 2** section: Sam (OSU · 3 mutual friends) + **Accept** (scarlet) + decline X; Tara (Michigan · 1 mutual friend) + Accept + X. **THIS WEEK** friend leaderboard: 1 Maya (gold numeral) 214 LP + **Challenge** pill (swords); **2 Nityanth [YOU]** you-row 196 LP; 3 Jordan 169 LP + Challenge; 4 Alex (Michigan) 154 LP + Challenge. Note: search opens as dedicated sheet (16b).

### 16b · Friend search sheet — result states — `s16b`
Grab handle; search field (focused, "sa" + caret) + Cancel (`#D9364A`). Results showing each relationship state: Sam — **Accept** (incoming request, scarlet); Sasha — **Add** (secondary, user-plus); Sandro (Penn State) — "Requested" (grey `#EDEFEA`/`#68707D`); Sarah — "Friends" (green check).

### 16c · Friends — empty — `s16c`
Header + search. Centered card: three overlapping avatars (Maya/Diego/Priya); "Build your league."; "Add friends to compare progress and create challenges."; **Search people** button (search icon).

---

## CHALLENGES — Overview · Empty · Create · Detail · Head-to-head

### 17 · Challenges — overview — `s17`
Header "Challenges" (700/26) + create button (bg `#171A1F` plus). **MOST URGENT** hero card (white, radius 20, shadow): "MOST URGENT" overline + "8H LEFT TODAY" (Barlow scarlet, clock). "Protein Push" (700/20) + "#2 OF 8" (Barlow scarlet). "128 / 150g today · Day 4 of 7"; h10 bar 85% `#D9364A`. Avatar stack (Maya/You/Alex/Diego +4) + **Log 22g more** button (scarlet, h40).
- **INVITES · 1** (dashed border card): Maya avatar + "Log Every Day" / "Maya invited you · 14 days · starts Mon" + **Join** (scarlet) + decline X.
- **ACTIVE · 2**: "Streak Sprint" (flame tile) "1 v 1" tag / "vs Jordan · you lead 7–6 · 10 days left" + "#1 OF 2" (green) + chevron.
- **UPCOMING · 1**: "Log Every Day" (calendar tile) / "Starts Monday · 5 joined" + "Joined" pill (green `#E3F2E9`/`#1E7A48`).
- **COMPLETED**: "June Meals Marathon" (medal tile `#F7EFD8`/`#B7791B`) / "Finished 2nd of 6 · +40 LP bonus" (card .8 opacity) + chevron.
Bottom nav Challenges active.

### 17b · Challenges — empty + templates — `s17b`
Header. Empty card: 52px `#EDEFEA` swords tile; "Start a challenge."; "Pick a goal, invite friends, and compete for the week." Template rows: Protein Push (beef tile `#FBEAEC`/scarlet) "Hit a daily protein goal for 7 days"; Log Every Day (calendar-check `#E3F2E9`/green) "At least one confirmed meal daily"; Streak Sprint (flame tile) "Longest streak wins the window".

### 18 · Create challenge — with inline error — `s18`
Header close X + "Create challenge". **Challenge name** field in error state (border `#C43D3D`, placeholder "e.g. Protein Push") + "Give your challenge a name. Everything else is saved." **Format** segmented Solo/Team. **Goal** chips Protein (selected `#171A1F`) / Meals / Streak. **Duration** pills 7 days (selected) / 14 / 21 / 30. **Stakes — optional** field "Loser buys smoothies" + pencil. **Invite friends · 2 selected**: avatar row Maya (selected, scarlet ring + check) / Jordan (selected) / Alex (dimmed) / More (dashed plus). Summary strip (`#F0F1ED`): "Untitled · Solo · Protein" / "7 days · you + 2 friends · winner takes bragging rights & smoothies". **Create challenge** scarlet. Prototype: empty name → cErr banner, values preserved (never a system alert).

### 19 · Challenge detail — group — `s19`
Header back + **Invite** pill (user-plus). **Dark hero** (`#171A1F`, radius 20): tags "GROUP · 8" + "150g PROTEIN / DAY" + "8H LEFT" (Barlow `#FF9AA6`). "Protein Push" (700/26 white). **#2** (Barlow 700/40 white) "OF 8 · DAY 4 / 7" + "Today 128 / 150g" bar 85% `#D9364A` on translucent track. **Standings — days goal was hit** card: 7-square strips (hit = `#1E9E5A`, today partial = `#F7C8CF`, empty = `#EDEFEA`): 1 Diego 4/7; **2 You** (you-row `#FBEAEC` + scarlet border) 3/7; 3 Maya 3/7. "Show all 8 participants." Details card: Goal "150g protein per day, 7 days"; Points "+5 LP per goal day · +40 LP winner"; Stakes "Loser buys smoothies". Note: a day counts when goal is hit; today's partial square fills at 150g.

### 19b · Challenge detail — head-to-head — `s19b`
Card: "Streak Sprint" centered + "Longest streak wins · 10 days left". **VS layout**: You (64px avatar, scarlet ring) "7 DAY STREAK" (Barlow 40) — "VS" (Barlow `#9AA1AB` .1em) — Jordan "6 DAY STREAK". Result strip (`#E3F2E9`): "You lead by 1 day. A missed day resets to zero." Note: one restrained VS, no battle effects.

---

## COACH — Welcome · Conversation

### 20 · Coach — welcome — `s20`
Header "MacroCoach" (700/26) / "Nutrition guide" + info button. "What can I help with?" (700/22); "Suggestions based on your day — 42g protein and 660 kcal remaining." Suggestion list rows (icon + text + chevron): "How am I doing on protein today?" (beef); "What could I eat with my remaining calories?" (utensils); "Why does fiber matter?" (wheat); "Should I eat carbs before training?" (dumbbell). Permanent disclaimer: "MacroCoach provides general nutrition education, not medical advice." Input bar: pill field "Ask about your nutrition…" + 48px send button (disabled `#EDEFEA`, arrow-up `#AEB4BC`). No robot avatars / sparkle iconography.

### 20b · Coach — conversation · typing · error — `s20b`
User bubble (right, `#171A1F`/white, radius `18 18 5 18`): "How am I doing on protein today?" Assistant bubble (left, white/border, radius `18 18 18 5`): "You're at **128g of your 170g target** — ahead of your usual pace for 3 PM. A typical dinner for you covers the remaining 42g." + inline progress mini-card "Protein today 128/170g" bar 75% `#D9364A` + "From your logged meals". User: "What should dinner be?" **Typing indicator**: 3 dots (`typing 1.2s` staggered .2s). Error bubble (`#FBEAEC`): circle-alert + "That didn't send." + **Retry** (rotate-ccw). Input focused ("high protein but cheap" + caret) + send active (scarlet). Answers about "today" always show real logged totals inline; input persistent/keyboard-safe. Prototype `coachProLine` dynamically references logged protein.

---

## PROFILE & REWARDS

### 21 · Profile — `s21`
Opens from header avatar. Header back + settings gear. Identity: 64px avatar + "Nityanth" (700/22) / "Ohio State · Member since Feb 2026". **Dark progression module** (`#171A1F`, radius 20): "LVL 4" tag (scarlet) + "Dedicated" + "340 XP to Level 5"; XP bar 66% `#D9364A`. Three stats (dividers): STREAK 7 (flame) / LP BALANCE 480 / LEAGUE RANK #4 (scarlet). 2×2 stat grid: Longest streak 14 / Meals logged 186 / Challenges won 3 / Total XP 2,140. **Achievements** ("All" link): Week One (flame tile) "7-day streak · earned yesterday" + NEW badge; Century Club (utensils green) "100 meals logged · earned Jun 4"; Consistency King (lock tile, locked) progress "18 / 25 meals" 72%. **Weekly protein chart**: 7 bars (goal-day = `#171A1F` + green check; below-goal = `#C6CBD1`; today = `#D9364A`; no-data Monday = diagonal-stripe pattern) with dashed goal line; caption "Checks mark goal days; Monday is striped — no meals were logged, so there's no data. 4 of 6 tracked days hit 170g." Menu list: Rewards (gift `#B7791B`, "480 LP") / Edit goals / Scoring rules / Notifications / University & dining. Note: goal days marked with checks + labels, never color alone. Sign Out / Delete live in Settings.

### 22 · Rewards — catalog — `s22`
Header back + "Rewards". **Balance card** (white, radius 20, shadow): "BALANCE" + **480 LP** (Barlow 700/44) + gift icon `#B7791B`. "Next reward: $10 Chipotle · 120 LP to go"; bar 80% `#B7791B`. **ALMOST THERE**: "$10 Chipotle credit" (CH mono tile) "Chipotle · expires Aug 31" · "600 LP / 120 to go". **AVAILABLE NOW**: Free smoothie (SM) "Campus Smoothie Co. · expires Jul 31" + **400 LP** button (`#171A1F`); Gym day pass (GY) "RPAC · expires Sep 15" + **250 LP**. **REDEEMED** (.75 opacity): Protein bar 2-pack (PB) "Redeemed Jun 12" + "Used" (green check). Note: neutral monogram placeholders until real partner marks; gold only for reward progress.

### 22b · Reward detail — confirm sheet — `s22b`
Grab handle; 52px SM tile + "Free smoothie" (700/19) / "Campus Smoothie Co." Card: Cost 400 LP; Balance after 80 LP; Expires Jul 31, 2026. Fine print: "One 16 oz smoothie, any menu item. One redemption per member. Show the pass at the register; the code is generated after you confirm." **Redeem for 400 LP** (scarlet) + **Not now** (ghost). No QR before confirmation. Prototype: confirmRedeem → balance −400, screen=pass.

### 22c · Redemption pass — `s22c`
Pass card (white, radius 20, shadow `0 10px 30px`): dark header (`#171A1F`) SM tile + "Free smoothie" / "Campus Smoothie Co." + "ACTIVE" badge (`#E8B931`). Body (dashed bottom border): 150px pixel QR (`image-rendering:pixelated`) + code "SMTH-4K7Q-92" (Barlow .25em). Details: Expires Jul 31, 2026; info "Show this pass at the register. Staff will scan or enter the code." **Mark as used** (secondary, check icon).

---

## SETTINGS & ACCOUNT

### 23 · Settings overview — `s23`
Back + "Settings". List group: Account "Email, password, avatar"; Nutrition goals "2,300 kcal · 170g protein"; Scoring rules; Notifications "4 of 5 on"; University "Ohio State · Traditions at Scott"; Privacy & account "Data, deletion". Separate card: **Sign out** (log-out). Version footer "MacroLeague 2.0.0 (418)". (Prototype Settings adds a **Delete account** destructive row `#C43D3D` and drops Privacy row.)

### 24 · Edit goals — unsaved state — `s24`
Back + "Nutrition goals" + "UNSAVED" badge (`#8A6A15`/`#F7EFD8`). Goal pills Build Muscle (selected) / Lose Weight / Maintain. Target rows (Barlow 700/28): Calories **2,400 · was 2,300** (delta `#B7791B`); Protein 170 g; Carbohydrates 260 g; Unsaturated fat 38 g; Trans fat **0 g** locked ("Fixed at zero", lock icon, `#9AA1AB`). **Save changes** scarlet. Toast (shown for reference, `#E3F2E9`): "Goals saved. They apply from tomorrow's score." Note: appears as toast after saving.

### 25 · Scoring rules + Notifications — `s25`
**How scoring works** card: XP badge (green) "**XP levels you up.** It only ever grows and never resets. Your level and title live on your profile."; LP badge (scarlet) "**League Points rank you.** They count within the current league window and reset when it ends. Spend them in Rewards."; utensils "**Each confirmed meal** earns 50 XP and 10 LP. Editing a meal doesn't earn again."; swords "**Bonuses:** +5 LP per challenge goal day, +40 LP for a challenge win, +20 LP each 7-day streak." **Notifications** card (switch rows): Streak reminders (on) "One evening nudge if the day's streak is unsecured"; Challenge updates (on) "Rank changes and final results in your challenges"; Friend alerts (on) "Requests, and when a rival passes you"; Goal reminders (**off**) "A mid-afternoon check-in on remaining targets"; Weekly report (on) "Sunday summary of scores, streak, and rank".

### 26 · University + dining — `s26`
Back + "University & dining". University dropdown "Ohio State University". Dining search field "Search dining halls…". Selectable list (scarlet check on selected): Traditions at Scott "North campus" (selected); Traditions at Morrill "South campus"; Kennedy Commons "Mid campus". **Empty dining-hall state** (below dashed divider): map-pin-off icon; "No dining halls listed yet"; "We don't have dining data for this university. You can still log any meal by describing it."

### 27 · Delete account — destructive sheet — `s27`
Bottom sheet over dimmed screen. Grab handle; 48px `#FBEAEC` trash-2 tile `#A8141E`. "Delete your account?" Three bullets: archive icon "Your account is **archived today** — it disappears from leagues and friends immediately."; calendar-x "Permanent deletion happens on **Jul 17, 2026** — 14 days from now."; undo-2 "Sign back in before then to **reactivate** with everything intact." **Delete my account** (bg `#C43D3D`) + **Cancel** (ghost ink). Prototype: confirmDelete → reactivate screen.

### 28 · Reactivation — `s28`
Full screen, vertically centered, calm (no gamification). 52px white archive tile. H1 "This account is scheduled for deletion." (700/26/1.25). "Your data is archived and hidden from leagues and friends. It will be permanently deleted on **Jul 17, 2026**." "Reactivate before then and everything — meals, streaks, points, friends — is restored exactly as you left it." Bottom: **Reactivate account** (scarlet) + **Sign out** (secondary). Prototype: confirmReact → Today (full reset).

---

## ANNOTATIONS — Redlines / Motion / A11y / Android
(Full detail in `02-interactions-and-motion.md`.)

### R1 · Redlines — Today hero — `f-red`
Card radius 20 · pad 18 · shadow `0 6 20 /.08`. Overline 11/500 ls .08em. Score Barlow 700 · 72/0.85. Calorie bar h12 r6, track `#EDEFEA`, fill text/primary. Macro bar h6 r3, gap-above 13. Button h50 r14 DM Sans 600/16. Screen padding 20 · card gap 14 · list row pad 12/14, divider `#F0F1ED`. Touch targets ≥44 (icon buttons render 36–40 with ≥44 hit slop). Score fill animates width only (transform-safe); numbers count up 400ms on load. Progress >100% → value turns semantic/error, bar clamps at 100%, copy stays neutral.

### A1 · Accessibility
Contrast: ink on canvas 14.9:1 · secondary 5.0:1 · scarlet on white 4.6:1 (used ≥15px or bold) · white on scarlet 4.6:1 — all AA. Not color alone: goal days = check + label; rank movement = arrow + number; errors = icon + message; rival = badge text. Every icon button has accessibilityLabel; avatars carry the person's name; progress bars expose value/max text. Dynamic Type: scalable units, hero score caps 1.4×, layouts wrap, chips move to a second row (tested to iOS AX3). Charts expose summary + per-bar text ("Wednesday, 168 grams"). Focus (web): 2px ink ring, logical tab order, sheets trap focus, Esc closes. States (selected/expanded/disabled/loading) exposed via accessibilityState. No auto-dismiss — success sheets/errors persist until acted on; toasts only for non-critical confirmations (goals saved).

### D1 · Android responsive — Today @ 412dp — `f-android`
Material adaptations: active-tab **pill indicator** (56×30 `#FBEAEC`, house `#A8141E`), full-radius button (radius 24), flatter elevation (`0 2px 8px`), hero score 64/0.9, back handled by system gesture, status bar 36px. Bottom nav becomes 5 equal tabs (Today/League/**Log** as plus-circle inline/Challenges/Coach) — no raised FAB. Tokens and hierarchy identical to iOS.

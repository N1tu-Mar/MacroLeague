# MacroLeague — Design Foundations (00)

Light-first redesign, July 2026. Source of truth: `MacroLeague Screens.dc.html` Foundations section (frames F1–F4) plus redline/motion/a11y frames (R1, M1, A1, D1). Every value below is taken verbatim from inline styles.

Global rules:
- App background is a warm neutral `#F5F6F3`. Body/base canvas behind device frames is `#ECEEE9`.
- **DM Sans** is the interface typeface (weights 400/500/600/700). **Barlow Condensed** (500/600/700) is reserved for *competitive numerals only*: scores, ranks, LP, XP, countdowns, streak counts, stat values. Never use Barlow for prose.
- Scarlet `#D9364A` is the single brand accent: one primary action per screen + competitive identity. Never decorative.
- Gold `#B7791B` appears **only** in Rewards and 1st place.
- Lucide icon set throughout. The streak flame is a 6-frame pixel sprite (`assets/streak-fire.png`) — the one intentional game-art exception.
- Device frame reference: 390 × 844 px (iOS), status bar 47px, home indicator bar 134×5px `#171A1F` @ opacity .18. Android reference 412dp (see D1 notes in `02`).

---

## 1. Color tokens (frame F1)

| Semantic name | Hex | Usage |
|---|---|---|
| bg/canvas | `#F5F6F3` | App background, warm neutral |
| surface/card | `#FFFFFF` | Cards, sheets, inputs |
| sheet surface (raised) | `#F9FAF8` | Bottom-sheet background (slightly warmer than card) |
| text/primary (ink) | `#171A1F` | Headings, values, dark hero surfaces |
| text/secondary | `#68707D` | Supporting copy, labels |
| text/tertiary/muted | `#9AA1AB` | Placeholder, de-emphasized meta, "/100" suffix |
| text/disabled | `#AEB4BC` / `#B7BCC3` | Disabled button label, dimmed loading text |
| brand/scarlet | `#D9364A` | Primary action, league identity, you-row accent |
| brand/carmine-deep | `#A8141E` | Pressed brand state, dark brand areas, error emphasis text |
| brand/tint | `#FBEAEC` | You-row highlight, selected radio bg, error banner bg |
| brand/tint border | `#F2D4D8` | Border on brand-tint banners |
| semantic/success | `#1E9E5A` | Goals hit, positive delta, +XP badge bg |
| success/deep text | `#1E7A48` | "Strong day" text, USDA badge text |
| success/tint | `#E3F2E9` | Success pill bg, USDA badge bg, check-circle bg |
| semantic/streak | `#E86A33` | Streak counts & momentum (NOT danger) |
| streak/tint | `#FBEFE8` | Streak pill bg |
| semantic/gold | `#B7791B` | Rewards progress & 1st place only |
| gold/text | `#8A6A15` / `#6E5511` | Confidence-badge & warning text |
| gold/tint | `#F7EFD8` | Medium-confidence badge bg, warning callout bg |
| gold/active-pass | `#E8B931` | "ACTIVE" pass badge bg; 1st-place avatar ring |
| semantic/error | `#C43D3D` | Validation, destructive button |
| error deep text | `#A8141E` | Auth-error heading, error icon |
| error muted text | `#8A4A52` / `#7C2A33` | Error body copy |
| border/input | `#CDD3D8` | Input & secondary-button borders (1.5px) |
| border/card | `#E3E6E0` | Card borders (1px) |
| border/hairline (divider) | `#E8EAE5` | Section dividers inside cards |
| border/row-divider | `#F0F1ED` | List-row separators |
| track/neutral | `#EDEFEA` | Progress-bar tracks, segmented-control bg, chip bg, disabled button bg |
| switch/off track | `#D5D9DE` | Switch off-state track; skeleton value blocks |
| grabber/handle | `#D5D9DE` | Sheet grab handle (40×5px) |
| macro carbs bar | `#9AA1AB` | Carbs progress fill; calorie-source carbs segment |
| macro fat bar | `#D5D9DE` | Fat calorie-source segment |
| dim overlay | `rgba(23,26,31,.38)` | Modal/sheet scrim |

**Avatar background tints** (DiceBear micah, per person, load-bearing for identity): Nityanth/You `#F3DBC9` (seed bg `f3dbc9`), Maya `#D8E4F2` (`d8e4f2`), Jordan `#E4D8F0` (`e4d8f0`), Priya `#F0D8DC` (`f0d8dc`), Diego `#D8E8EA` (`d8e8ea`), Alex `#D5E8DC` (`d5e8dc`), Emma/Alexandra `#EAE4D0` (`eae4d0`), Sam `#F2E3D0` (`f2e3d0`), Priya alt `#E3E8F2`. Avatar URL pattern: `https://api.dicebear.com/9.x/micah/svg?seed={Name}&backgroundColor={bg}`.

**Meal-icon tile tints:** breakfast/warm `#F3E4D2` icon `#A0642A`; salad/green `#E2EDD9` icon `#5A7A3A`; profile-green `#E3F2E9` icon `#1E9E5A`; shake `#E3E8F2` icon `#4A6288`; onboarding utensils `#F3E4D2`→ tile `#F3E4D2` icon `#A0642A`.

---

## 2. Typography scale (frame F2)

All type is `font: {weight} {size}/{line-height} {family}`. Line-height omitted below = browser default for that role; explicit where the spec gives it.

| Role | Family | Weight | Size px | Line-height | Letter-spacing | Usage |
|---|---|---|---|---|---|---|
| score/hero | Barlow Condensed | 700 | 64–72 | 0.85–0.95 | — | Today Nutrition Score (72/0.85). Welcome/onboarding preview 56/0.9. Review calories 56/0.9. Android 64/0.9. Caps at 1.4× dynamic type. |
| score/display | Barlow Condensed | 700 | 40 | 1 | — | Ranks (#4), countdowns (2D 8H), LP totals, H2H streak numerals, rank-change #4 |
| score/med | Barlow Condensed | 700 | 30–44 | 1 | — | 44 = league "Your rank"/rewards balance; 30–38 = success before/now rank, results kcal |
| score/stat | Barlow Condensed | 700 | 20–32 | 1 | — | Target values (32), profile stats (22), macro stat tiles (17–20), LP row values (15) |
| numeral/inline | Barlow Condensed | 700 | 12.5–15 | 1 | .04em (countdowns) | Streak counts, LP in rows, movement, "2D 8H LEFT" |
| overline | DM Sans | 500 | 11 | 1.45 | .08em, UPPERCASE | Section markers ("NUTRITION SCORE", "REQUESTS · 2") |
| title | DM Sans | 700 | 28 | 1.15–1.2 | −.02em | Screen titles (onboarding H1). Welcome/signin big headline 40/1.12 −.025em |
| title/screen-sm | DM Sans | 700 | 30 | 1.15 | −.02em | Sign in / Create account H1 |
| heading | DM Sans | 700 | 26 | — | −.02em | Tab-screen H1 (League, Friends, Challenges, MacroCoach) |
| heading/section | DM Sans | 700 | 20 | 1.25 | −.01em/−.015em | Section headings, sheet titles, "Today's meals", "Log a meal" (22) |
| subhead | DM Sans | 600 | 16 | 1.4 | — | Card titles / emphasized rows |
| body | DM Sans | 400 | 15 | 22px (1.5) | — | Body copy, coach messages |
| body/lg | DM Sans | 400 | 16 | 24px | — | Welcome subtitle |
| card-title | DM Sans | 600 | 14 | 1.4 | — | Meal names, list-row titles |
| label | DM Sans | 500 | 13 | 1.45 | — | Form labels, list metadata |
| label/sm | DM Sans | 500 | 11–12.5 | 1.4 | — | Input field labels (11.5), captions |
| button | DM Sans | 600 | 16–16.5 | — | — | Primary button label (h54). Secondary 15–15.5 |
| mono/spec | ui-monospace | 400 | 10–11 | — | — | Token captions in Foundations only (not in product) |

Notes: hero score number animates count-up 400ms on load; under reduced motion renders final value immediately.

---

## 3. Spacing scale (frame F3)

4pt base scale: **4 · 8 · 12 · 16 · 20 · 24 · 32**.
- Screen horizontal padding: **20px** (auth/onboarding screens use 22px).
- Card-to-card vertical gap: **14px** (some flows 12px).
- List row padding: **12px vertical / 14px horizontal** (13–14 in denser lists).
- Card inner padding: 14–18px (hero cards 18px, sheets 20px h).
- Status bar height 47px; bottom home-indicator strip 22–24px.

## 4. Radius scale (frame F3)

| Token | px | Usage |
|---|---|---|
| chip / small tile | 10 | Icon tiles, small chips, stepper buttons |
| input | 13–14 | Text fields, secondary tiles |
| button | 14 | Primary/secondary buttons |
| card | 16 | Standard cards, list containers |
| hero | 20 | Hero cards, dark stat panels |
| sheet | 24 (top corners only: `24 24 0 0`) | Bottom sheets |
| pill | 99 | Chips, pills, streak/LP pills, toggles, FAB (27 = 54px circle) |

## 5. Elevation / shadow (frame F3)

Flat by default — most surfaces use **border only** (`1px #E3E6E0`).

| Level | Value |
|---|---|
| card (default) | border only, no shadow |
| hero | `0 6px 20px rgba(23,26,31,.10)` — Foundations sample; Today hero uses `0 6px 20px rgba(23,26,31,.08)` |
| welcome preview | `0 10px 30px rgba(23,26,31,.10)` |
| sheet | `0 12px 32px rgba(23,26,31,.16)`; live sheets use `0 -12px 40px rgba(23,26,31,.22)` |
| FAB (log) | `0 8px 20px rgba(217,54,74,.35)`, 4px canvas-colored border |
| device frame (prototype) | `0 24px 60px rgba(23,26,31,.18), 0 0 0 1px rgba(23,26,31,.08)`; screen tiles `0 2px 8px rgba(23,26,31,.06)` |
| floating chip (welcome) | `0 6px 18px rgba(23,26,31,.12)` |
| segmented active thumb | `0 1px 3px rgba(23,26,31,.10)` |
| switch knob | `0 1px 3px rgba(0,0,0,.2)` |

---

## 6. Core components & states (frame F4)

### Primary button (h54, radius 14, DM Sans 600/16)
| State | Style |
|---|---|
| default | bg `#D9364A`, text `#fff` |
| pressed | bg `#A8141E`, `transform:scale(.98)` (prototype `.btnp:active` = scale(.97) + brightness .92) |
| loading | bg `#D9364A`, 16px spinner (`border:2px rgba(255,255,255,.4)`, top `#fff`, `spin .8s linear infinite`) + text ("Signing in…"). Text never replaced by a bare spinner. |
| disabled | bg `#EDEFEA`, text `#AEB4BC` |

### Secondary / ghost
- Secondary: bg `#fff`, `1.5px #CDD3D8` border, text `#171A1F`, h48–50, radius 14.
- Ghost/text button: transparent, text `#D9364A` 600 (e.g. "View today").
- Google button: white, 1.5px border, 18px multicolor Google glyph + "Continue with Google".

### Text field (radius 14, pad 9–10 / 14–16)
| State | Style |
|---|---|
| default | bg `#fff`, `1.5px #CDD3D8`; label `#68707D` 11.5, value `#171A1F` 15.5 |
| focus | border `#171A1F`, ring `0 0 0 3px rgba(23,26,31,.06)`, label turns `#171A1F` |
| error | border `#C43D3D`, label `#C43D3D`; below: icon `circle-alert` 13–14px + message `#C43D3D` 12.5 |
Password field: value letter-spacing 2–2.5px, trailing `eye`/`eye-off` icon `#68707D` (≥44px hit area). Password strength: 3 segments (`#1E9E5A` filled / `#EDEFEA` empty) + label "Good".

### Segmented control (bg `#EDEFEA`, radius 12, pad 3)
Active segment: white, radius 9, `0 1px 3px rgba(23,26,31,.10)`, text `#171A1F` 600/13.5. Inactive: `#68707D` 500.

### Chips
- Selected: bg `#171A1F`, text `#fff`, 600/13, radius 99, pad 8×14.
- Unselected: `1.5px #CDD3D8` border, text `#171A1F`, 500.
- Goal chips (Create): selected `#171A1F`/white radius 12; unselected bordered.

### Switch (46×28, radius 99)
- On: track `#1E9E5A`, 24px white knob top:2 right:2, shadow `0 1px 3px rgba(0,0,0,.2)`.
- Off: track `#D5D9DE`, knob top:2 left:2.

### Steppers
36px square buttons (Settings/onboarding) or 38px in 12-radius bordered group with `minus`/`plus` `#171A1F`; value in Barlow 700/16 centered with 1.5px hairline dividers. Increments honest: ±50 kcal, ±5g protein/carb, ±2g fat, servings ±0.5 (0.5–4), quantity ±1.

### Avatars
Circular DiceBear micah, per-person bg tint. Sizes seen: 22, 26, 30, 32, 34, 36, 38, 40, 48, 56, 64px. Rings: white 1.5–2px + `0 0 0 1px #E3E6E0` (profile), medals `0 0 0 2px` (gold `#E8B931`, silver `#C0C6CC`, bronze `#D2A679`). Overlap stacks use `margin-left:-7px` (or −8/−10) with white borders; "+N" overflow label `#68707D`.

### Streak pill
bg `#FBEFE8`, radius 99, pad 6×10/7. 16px pixel-flame sprite (`background-size:96px 16px`, `image-rendering:pixelated`, `animation:flame .6s steps(6) infinite`) + Barlow 700 count in `#E86A33`. Sprite sizing scales with count size (14→84px, 15→90px, 16→96px, 18→108px sheet).

### LP pill
bg `#EDEFEA`, radius 99, pad 6×10/11. Barlow 700 value `#171A1F` + "LP" DM Sans 600/10–10.5 `#68707D`.

### Source & confidence badges (radius 6, 600/11, pad 4×8)
| Badge | Text color | Bg |
|---|---|---|
| USDA match | `#1E7A48` | `#E3F2E9` |
| Composite estimate | `#68707D` | `#EDEFEA` |
| Medium confidence | `#8A6A15` | `#F7EFD8` (+ 6px `#B7791B` dot) |
| High confidence | `#1E7A48` | `#E3F2E9` |
| Low–medium confidence | `#8A6A15` | `#F7EFD8` |

### +XP / +LP badges
- +XP: text `#fff`, bg `#1E9E5A`, radius 6 (inline) or 8 (success sheet), Barlow 700/11–15.
- +LP: text `#fff`, bg `#D9364A`, same shape.
- Onboarding "Every meal" preview uses larger `+50 XP` (Barlow 24, green) and `+10 LP` (Barlow 24, scarlet) tiles.

### Rank / medal indicators
Crown icon `#B7791B` for #1; rank numerals colored by place — 1 `#B7791B`, 2 `#8C9096`, 3 `#A9743C`, else `#68707D`; you-row `#D9364A`. Movement: `arrow-up` `#1E9E5A`+N / `arrow-down` `#C43D3D`+N / `—` `#9AA1AB` (dash only where no data).

### "YOU" / "RIVAL" tags
YOU: `#D9364A` 600/10 on white radius 5, pad 2×6. RIVAL: `#D9364A` 500/10 inline; rival avatar carries a `target`-icon badge (`#D9364A` 15px circle, white border).

### Progress bars
Track `#EDEFEA`. Hero calorie bar h12 r6 fill `#171A1F`. Macro bars h6–8 r3–4: protein fill `#D9364A`, carbs `#9AA1AB`, generic `#171A1F`/`#B7791B` (rewards). Fills animate width only (transform-safe), 400ms from 0 on first appear only. >100% → value text turns `#C43D3D`, bar clamps at 100%, copy stays neutral.

### General
All touch targets ≥44px (icon buttons render 36–40 visually with ≥44 hit slop). Switch, chips, segmented controls are the only selection controls app-wide. Not-color-alone everywhere (checks+labels, arrows+numbers, icon+message).

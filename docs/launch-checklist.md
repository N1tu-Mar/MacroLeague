# Launch checklist

What was built in the pre-launch hardening pass, and — more importantly — **what
still needs a human**. Everything in "Blocking" must be done before a store
submission; nothing in it can be done from code alone.

## Backend deploy — DONE

Migrations `0020`–`0025` are **applied**; `migration list --linked` shows local
and remote matching at `0025`. Function secrets set (`ALLOWED_ORIGINS`,
`PUSH_NOTIFICATIONS_SECRET`, the four rate-limit tunables), Vault secret
`push_notifications_secret` created, and `send-notifications`, `chat`,
`estimate-meal`, `account-lifecycle` all redeployed.

Verified live, not assumed:

| Check | Result |
|---|---|
| 7 cron jobs registered and active | ✅ |
| 6 new tables present | ✅ |
| `chat` with no token | `401` |
| `chat` with only the anon key | `401 Not authenticated` |
| `send-notifications` with no / wrong cron secret | `403 Forbidden` |
| `send-notifications` with the real secret | `200`, no-op on empty queue |
| CORS preflight from `macroleague.app` | allow-origin echoed |
| CORS preflight from an unlisted origin | no allow-origin header (browser blocks) |

`normalize_rule_set` reported **0 personal rule sets repaired** — no one had
tampered with payout values.

**Spend protection.** `chat` and `estimate-meal` both call `consume_api_quotas`
*after* validation but *before* any paid call (OpenAI, USDA, OpenFoodFacts), and
the quota is keyed to a `userId` from server-verified JWT (`auth.getUser(token)`),
never a client-supplied field. A stolen anon key — which is public by design,
it ships in the app bundle — cannot reach a paid API at all. Draining the
OpenAI key would require a real authenticated account, and each is capped at
100 chat + 200 estimate calls/day.

### CORS allow-list

`cors.ts` now supports a single `*` per entry, matching within one hostname
label only (never across a dot). This exists for hosts that mint rotating
preview URLs; `patternToRegExp` is unit-tested for dot-crossing, anchoring, and
metacharacter escaping.

Current `ALLOWED_ORIGINS`:

```
https://macroleague.app, https://www.macroleague.app,
https://macroleague.vercel.app, https://macroleague-*.vercel.app,
http://localhost:8081, http://localhost:19006, http://localhost:3000
```

**Scope wildcards tightly.** `https://macroleague-*.vercel.app` allows only this
project's previews. A bare `https://*.vercel.app` would allow *any* page on
vercel.app, and anyone can deploy there free — barely narrower than the wildcard
this module exists to remove. Verified live: `someoneelse.vercel.app` is blocked.

> **Assumption to confirm:** the Vercel project is named `macroleague`, giving
> `macroleague.vercel.app` and `macroleague-<hash>-<team>.vercel.app`. If yours
> differs, re-run `supabase secrets set ALLOWED_ORIGINS=...` with the real names
> and redeploy the functions — no code change needed.

Verified against the live deployment:

| Origin | Result |
|---|---|
| `macroleague.app`, both localhosts, `macroleague.vercel.app` | allowed |
| `macroleague-abc123-nitu.vercel.app` (preview) | allowed |
| `someoneelse.vercel.app` | blocked |
| `macroleague-x.evil.com`, `macroleague-x.vercel.app.evil.com` | blocked |
| `macroleague-x.sub.vercel.app`, `macroleague.app.evil.com` | blocked |
| disallowed origin + bearer | `403 Origin not allowed` *before* the handler |
| **no Origin header (native iOS/Android)** | **not blocked** — falls through to auth |

## Resilience pass (code, already done)

Fixed without needing anything from you; all gates green (tsc clean, 236 unit
tests, 32 migration tests, 0 lint errors):

- **`App.tsx` cold-start hang.** `init()` had no `try`/`catch` and `setLoading(false)`
  was its last statement, so any throw — a corrupt stored session, a token
  refresh on captive-portal Wi-Fi — stranded the app on its spinner forever.
  `ErrorBoundary` cannot catch this (rejected promise in an effect, not a render
  throw). Now falls back to the signed-out shell and reports to Sentry.
- **Raw `"Network request failed"` shown to users** at 20 call sites. New
  `src/lib/errors.ts` (`toUserFacingMessage`) maps transport failures to
  "You're offline…" and timeouts to their own copy, while leaving deliberate
  service messages (quota, validation) untouched.
- **No request timeouts.** `chat` (45s) and `estimate-meal` (20s) edge-function
  calls are now bounded via `withTimeout`; previously a stalled connection hung
  the UI in its sending state with no way out.
- **Silently swallowed failures.** `userStore.refreshStats` /
  `refreshAccountStatus` and `useMealLogger` logged to `console` only — a failed
  stat hydration left the user on seeded zeros (0-day streak, 0 points) with
  nothing in Sentry. Now routed through `reportError`.
- **`jest` `testMatch` silently skipped co-located tests.** A file at
  `src/services/foo.test.ts` never ran — green build, zero tests executed.
  Broadened, with `supabase/functions/` excluded (those are Deno tests).

Still open, needs a judgement call: there is **no `NetInfo` dependency**, so the
app cannot pre-emptively detect offline state — it only reacts once a request
fails. That is acceptable for launch but worth adding.

---

## Blocking — cannot ship without these

### 1. Host the legal pages on a domain you own
`src/lib/legal.ts` now builds both URLs from `EXPO_PUBLIC_WEB_ORIGIN`
(default `https://macroleague.app`). The pages themselves already exist at
`public/privacy-policy.html` and `public/terms.html`, so deploying the web export
publishes them.

App Review **fetches the privacy URL**. If it 404s, redirects, or sits on a host
you don't control, the submission is rejected. Previously these pointed at
ephemeral `claude.ai/code/artifact/...` links.

```bash
npx expo export --platform web     # -> dist/
# deploy dist/ to your domain, then confirm BOTH resolve over HTTPS:
#   https://<your-domain>/privacy-policy.html
#   https://<your-domain>/terms.html
```

Then set `EXPO_PUBLIC_WEB_ORIGIN` (and `EXPO_PUBLIC_SUPPORT_EMAIL`) per EAS
environment. `SUPPORT_EMAIL` currently defaults to `support@macroleague.app` —
that mailbox must actually receive mail.

### 2. Fill in store submission credentials
`eas.json` has placeholders that are deliberately obvious:

```
"appleId":     "APPLE_ID_EMAIL_REPLACE_ME"
"ascAppId":    "ASC_APP_ID_REPLACE_ME"
"appleTeamId": "APPLE_TEAM_ID_REPLACE_ME"
"serviceAccountKeyPath": "./secrets/play-service-account.json"
```

`secrets/` is gitignored. `eas submit` cannot run until these are real.

### 3. Rotate the exposed FatSecret key
Confirmed dead: `grep` finds **no reference to it anywhere in `src/`, `supabase/`,
`app.json`, or `eas.json`** — nothing reads this key. Left in place rather than
deleted, since the working tree holds the only copy and you need the value to
rotate it at FatSecret. Rotate, then delete the line.

`.env:8` holds a live third-party credential (`expo_fat_secret_key`). It lacks the
`EXPO_PUBLIC_` prefix so it was never bundled into the app, and it is not in git
history — but it has been sitting in a working tree. **Rotate it and delete the
line.** `.gitignore` now covers `.env*` (it previously only matched `.env` and
`.env*.local`, so `.env.production` would have been committed).

### 4. Store privacy disclosures
The iOS privacy manifest is now declared in `app.json` (`NSPrivacyAccessedAPITypes`
+ `NSPrivacyCollectedDataTypes`). You must still fill in, by hand:
- **App Store Connect** → App Privacy — must match the manifest.
- **Play Console** → Data safety.
- Both must disclose the three processors: **Amplitude, TelemetryDeck, Sentry**.
- Age rating: the app now has a 13+ gate at signup (`src/lib/ageGate.ts`), collects
  health/fitness data, and has social features. Rate it accordingly.

### 5. ~~Verify `assets/icon.png`~~ — DONE, verified
`sips` reports **1024×1024, `hasAlpha: no`**. App Store Connect will accept it.
No action needed.

---

## Deploy — code is written, needs running

```bash
npm install                       # expo-notifications was added to package.json
npx supabase db push              # migrations 0020-0025
npx supabase functions deploy send-notifications
npx supabase functions deploy chat estimate-meal account-lifecycle   # CORS + rate limits changed
```

### Function secrets

```bash
# Origin allow-list. Native apps send no Origin and are unaffected; this gates
# browsers only. Getting it wrong breaks the WEB build, never iOS/Android.
npx supabase secrets set ALLOWED_ORIGINS="https://macroleague.app,https://www.macroleague.app"

# Push sender (mirrors ACCOUNT_PURGE_SECRET from 0010 — fail-closed if unset).
npx supabase secrets set PUSH_NOTIFICATIONS_SECRET=<32-byte hex>

# Optional rate-limit tuning. Defaults: chat 10/min + 100/day,
# estimate-meal 20/min + 200/day.
npx supabase secrets set CHAT_DAILY_LIMIT=100 CHAT_BURST_LIMIT=10
npx supabase secrets set ESTIMATE_DAILY_LIMIT=200 ESTIMATE_BURST_LIMIT=20
```

### Vault secrets (read by pg_cron at fire time, never hardcoded)

```sql
select vault.create_secret('<same value as PUSH_NOTIFICATIONS_SECRET>',
                           'push_notifications_secret', 'push sender auth');
-- project_anon_key already exists from migration 0010.
```

### Push credentials
`eas credentials` → upload an **APNs key** (iOS) and an **FCM v1 service account**
(Android). Without them Expo mints tokens but every send is rejected. The EAS
project id is already in `app.json`.

### Cron jobs after deploy
| Job | Schedule (UTC) | Source |
|---|---|---|
| `purge-expired-accounts` | 04:00 | 0010 |
| `prune-api-usage` | 04:30 | 0020 |
| `finalize-due-challenges` | 05:00 | 0024 |
| streak / challenge reminders | hourly | 0023 |

Reminder enqueues run **hourly** and fire only for users whose *local* hour
matches — a single daily UTC run cannot be "evening" everywhere. The per-local-day
dedupe key makes the other 23 ticks no-ops.

Verify: `select jobname, schedule, active from cron.job;`

### Sentry source maps
`src/lib/monitoring.ts` now sets `release` and `dist` via `releaseName()`. **CI must
upload source maps under the same release string** or every production crash
arrives as unreadable minified frames. Set `SENTRY_AUTH_TOKEN` in CI secrets; the
workflow step is env-gated and skips cleanly without it.

---

## Dependency policy — read before running `npm audit fix`

**Do not run `npm audit fix --force` on this project.** It was run once and made
things strictly worse:

- **Downgraded `@sentry/react-native` from `~7.11.0` to `^5.15.2`** — two major
  versions *backwards*. A security "fix" that installs two-year-old crash
  reporting is a regression, not a fix.
- **Bumped `expo` to `^57` and `expo-splash-screen` to `^57`** while leaving the
  other ten `expo-*` packages on `~56`. An Expo SDK must be version-aligned; a
  split install is not a supported configuration.
- **Loosened `~` pins to `^`**, which is how an SDK silently drifts out of
  alignment on the next install.

The manifest has been restored to the aligned SDK 56 line.

### The audit findings are resolved by an override, not an upgrade

All twelve advisories traced to a single root: `uuid < 11.1.1`
(GHSA-w5hq-g745-h8pq) reached through `xcode` → `@expo/config-plugins` → the rest
of the Expo CLI. npm's only offered "fix" was downgrading `expo-splash-screen` to
55 — older, and therefore worse.

`package.json` now carries:

```json
"overrides": { "uuid": "^11.1.1" }
```

`npm audit` reports **0 vulnerabilities**. Verified safe rather than assumed:
`xcode/lib/pbxProject.js:90` calls `uuid.v4()` with **no buffer argument**, and
the advisory only affects v3/v5/v6 *when a buffer is passed* — so this code was
never actually exposed. The override is a supply-chain hygiene measure that
silences a true-but-unreachable finding. `expo config --type prebuild`, the web
bundle, and pbxproj id generation were all re-verified after it.

Worth knowing generally: an Expo project's `npm audit` output is dominated by
**build-time CLI tooling that never ships in the app binary**. Judge findings by
whether the vulnerable code is reachable at runtime, not by the count.

### `date-fns` was a missing peer dependency

`date-fns-tz@3.2.0` requires `date-fns` as a peer, and it was never declared.
`src/services/mealLogService.ts:2` imports `fromZonedTime`/`toZonedTime`, so
**`npx expo export` failed outright** — the web bundle could not build at all.
`date-fns@^4.1.0` is now a direct dependency and the export succeeds. The new CI
build job would have caught this.

---

## Known gaps — deliberately left, in priority order

1. **No merchant-facing redemption surface.** `validate_reward_code` is correct and
   single-use-safe but is **service_role only**, because this app has no staff or
   partner role — no `merchants` table, no partner auth, no JWT claim separating a
   barista from any member. Granting it to `authenticated` would mean anyone who
   glimpsed a code could burn it. Nothing calls it yet, so **a member can obtain a
   real pass but no one can redeem it at a register.** Needs partner auth + an
   edge function or operator console. `p_redeemed_by` is trusted attribution, not
   authorization.
2. **Notification types with no enqueue job.** `friend_activity`, `weekly_report`
   and `reward` have preference columns, queue support, copy and sender support —
   but only streak and challenge-ending reminders are scheduled.
3. **No notification tap handling.** Payloads carry `target` / `challenge_id`; a
   `addNotificationResponseReceivedListener` in the navigator is the follow-up.
4. **Team leaderboard** is still an explicit "coming soon" placeholder.
5. **Rank movement arrows** still render `movement={0}` — no previous-rank snapshot
   is stored anywhere.
6. **No meal history / past-day editing.** Home and the logger are still hardcoded
   to `new Date()`; you cannot correct yesterday's log.
7. **No data export** (GDPR/CCPA-adjacent). Account *deletion* does exist and
   satisfies Apple 5.1.1(v).
8. **No offline support.** Every screen assumes connectivity; a failed log is lost.
9. **Dining halls are collected but unused** — `universityDining.ts` and migration
   0012 feed only a settings screen, despite being the stated product premise.
10. **`unfriend` has no UI.** `friendService.removeFriend()` exists with zero
    callers, so an accepted friendship is currently permanent.

---

## Verification

```bash
npm install     # required first: expo-notifications, eslint toolchain, pglite

npm run lint
npm run typecheck
npm test        # 185 unit tests
npm run test:db # applies all 25 migrations to a real Postgres + 32 behavioural checks
deno test --allow-net --allow-env --no-lock supabase/functions/_shared/   # 22 tests
```

`npm run test:db` runs Postgres in-process via PGlite (WASM — no Docker, no
server) and is wired into CI. It applies every migration in order and then
exercises the security-critical functions: quota enforcement and fail-closed
behaviour, the rule-set economy lock, friend-feed visibility (a non-friend must
see nothing), social-handle format constraints, and challenge-finalization
authorization.

**What it does not cover** — read `supabase/tests/pg/migrations.test.mjs` before
trusting a green run. RLS policies are *not* exercised (everything runs as
superuser; the SECURITY DEFINER functions are what get tested), and pg_cron /
pg_net / pg_trgm / pgcrypto are stubbed because PGlite lacks them — so cron
*scheduling* and the trigram indexes are unverified.

A green run means the SQL is valid and the logic behaves. It is **not** a
substitute for `supabase db push` against a **staging** project. Do not push
straight to production.

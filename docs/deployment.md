# MacroLeague deployment guide

MacroLeague is an Expo/React Native application with one TypeScript/React UI that
Metro bundles for three targets:

- **Web:** JavaScript, HTML, and static assets that run in a browser.
- **iOS:** a signed native `.ipa` uploaded to TestFlight/App Store Connect.
- **Android:** a signed `.aab` for Google Play, or an installable `.apk` for testing.

Expo does not turn the app into a wrapped website on mobile. React Native renders
native iOS and Android views, while React Native Web maps the same components to
browser elements. Platform-specific native modules and store signing are the main
parts that differ.

## Current project readiness

The repository already contains the core EAS configuration:

- Expo project ID: `37420ff0-cd02-4700-8b7b-ddf0a271c58b`
- iOS bundle ID: `com.macroleague.app`
- Android package: `com.macroleague.app`
- Deep-link scheme: `macroleague://`
- `development`, `development-simulator`, `preview`, and `production` EAS profiles
- Separate EAS variable environments for development, preview, and production
- Automatic native build-number/version-code increments for production builds

These identifiers become the app's permanent store identity. Confirm that
`com.macroleague.app` belongs to the intended organization before the first store
release; changing it later creates a different app.

Verified locally on July 3, 2026:

- `npm run typecheck` passes.
- All 14 Jest tests pass.
- Expo Doctor passes all 21 SDK/dependency/configuration checks.
- `npx expo config --type public` resolves iOS, Android, and web configuration.
- A production web export completes successfully.

## 1. Accounts and command-line setup

Install EAS CLI and sign in:

```bash
npm install --global eas-cli
eas login
eas project:info
```

EAS Build is Expo's hosted native build service. It can manage Apple and Android
signing credentials and produce binaries without a local Xcode/Android Studio
toolchain. See [EAS Build](https://docs.expo.dev/build/introduction/) and
[Expo's first-build guide](https://docs.expo.dev/build/setup/).

Public distribution additionally requires:

- An Apple Developer Program membership and an App Store Connect app for iOS.
- A Google Play Developer account and Play Console app for Android.

## 2. Configure build-time variables

The client requires these variables:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
```

This one is optional:

```text
EXPO_PUBLIC_SENTRY_DSN
```

Create the required variables for every EAS environment used by its matching
build profile:

```bash
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value YOUR_URL --visibility plaintext
eas env:create --environment development --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY --visibility sensitive

eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value YOUR_URL --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY --visibility sensitive

eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value YOUR_URL --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value YOUR_ANON_KEY --visibility sensitive
```

`EXPO_PUBLIC_*` values are embedded in client bundles and must be considered
public. The Supabase anon key is designed for that model; authorization remains
enforced by Supabase RLS. Server keys for USDA, email, chat, or account lifecycle
belong in Supabase function secrets, never in Expo client variables. See
[Expo's EAS environment-variable guide](https://docs.expo.dev/eas/environment-variables/).

Local `.env` files are already ignored by Git. A local file needs the two required
Supabase values before `npm start`, tests involving the app entry, or web export.

## 3. Configure authentication redirects

In Supabase Authentication → URL Configuration, allow the destinations used by
the application:

- `macroleague://auth` for installed development and store builds.
- The exact production web origin, such as `https://app.example.com`.
- Local web origins used for development, such as `http://localhost:8081`.
- The Expo Go development redirect printed by the app when Expo Go is used.

These redirects are used by both Google OAuth and password recovery. Test both on
each platform before release; a web callback succeeding does not prove that a
custom-scheme callback opens an installed mobile app.

## 4. Web deployment

Create an optimized static export:

```bash
npm run typecheck
npm test -- --runInBand
npm run export:web
```

The deployable site is written to `dist/`. Upload that directory to a static host
such as Netlify, Vercel, Cloudflare Pages, S3/CloudFront, or another CDN. Configure
the production Supabase variables before exporting because Expo inlines public
client variables into the bundle.

The current app uses React Navigation rather than Expo Router. Its static export
has been verified, so static hosting is the least surprising path today. Current
EAS Hosting documentation requires an explicit `web.output` of `static` or
`server`; evaluate an Expo Router/web-output migration before choosing that route.
See [Expo web publishing](https://docs.expo.dev/deploy/web/) for the current EAS
Hosting workflow.

## 5. Android builds and release

### Development build

```bash
eas build --platform android --profile development
```

This includes Expo developer tools and can be installed on a device or emulator.
Start Metro afterward with `npx expo start --dev-client`.

### Shareable preview

```bash
eas build --platform android --profile preview
```

The internal-distribution profile produces a directly installable build suitable
for team QA without a Play Store release.

### Google Play production

```bash
eas build --platform android --profile production
```

Production uses the store-oriented Android App Bundle format by default. Create
the Play Console listing, complete its policy/data-safety content, and manually
upload the first build. Google requires that first manual upload before API-based
EAS submissions can work. Subsequent builds can be submitted with:

```bash
eas submit --platform android --profile production
```

The detailed prerequisites are in Expo's
[Google Play submission guide](https://docs.expo.dev/submit/android/).

## 6. iOS builds and release

### iOS Simulator development build

```bash
eas build --platform ios --profile development-simulator
```

This produces a simulator build. It does not run on a physical iPhone.

### Physical-device development or preview

```bash
eas build --platform ios --profile development
eas build --platform ios --profile preview
```

Internal iOS distribution requires Apple signing and registered test devices.
EAS prompts for credentials/device registration. A development build contains
developer tools; a preview build is closer to production.

### TestFlight and App Store production

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Submission uploads the binary to App Store Connect/TestFlight. It does not by
itself publish publicly: complete screenshots, privacy disclosures, age rating,
review information, and then submit the selected build for Apple review. See
Expo's [Apple submission guide](https://docs.expo.dev/submit/ios/) and
[iOS production-build walkthrough](https://docs.expo.dev/tutorial/eas/ios-production-build/).

## 7. Backend deployment is separate

The Expo build contains the client. It does not automatically deploy Supabase
migrations or Edge Functions. Before public testing, separately apply the intended
database migrations and deploy the functions used by meal estimation, chat,
account lifecycle, and account purging. Confirm production function secrets and
scheduled jobs in the target Supabase project.

Do this deliberately against the correct Supabase project; building an app binary
does not require or authorize a production database push.

## 8. Release checklist

1. Review and commit the intended source/migration changes.
2. Run `npm run typecheck`, `npm test -- --runInBand`, and `npm run export:web`.
3. Verify EAS development/preview/production environment variables.
4. Apply the reviewed Supabase migrations and deploy required Edge Functions.
5. Test email/password login, Google OAuth, password reset, meal logging, and
   challenge creation in production-like preview builds on both platforms.
6. Test the web export on the final HTTPS domain and add that origin to Supabase.
7. Build Android/iOS preview binaries and perform physical-device QA.
8. Prepare store icons, screenshots, descriptions, privacy policy, support URL,
   data-safety/privacy answers, and an App Review test account if required.
9. Build production binaries, upload to internal Play testing/TestFlight, and only
   promote them publicly after that round passes.

For later releases, EAS can combine build and upload with `--auto-submit`, but a
manual promotion/review step remains for public store release.

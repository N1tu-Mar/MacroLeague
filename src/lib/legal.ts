import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Single source of truth for MacroLeague's legal links and support contact.
 *
 * Apple and Google both require the Privacy Policy and Terms to live at stable,
 * publicly reachable HTTPS URLs (used in the store listing AND linked from inside
 * the app). App Review fetches the privacy URL directly — if it 404s, is behind a
 * login, or lives on a host you don't control, the submission is rejected.
 *
 * The pages themselves ship with the web export as static files
 * (`public/privacy-policy.html` and `public/terms.html`), so deploying the web
 * build to your domain publishes both at the paths below automatically.
 *
 * The origin is env-driven so preview/staging builds can point at a preview
 * deploy without a code change. Set EXPO_PUBLIC_WEB_ORIGIN per EAS environment.
 *
 * There is intentionally NO support website — support is handled over email only.
 */

/**
 * Public origin serving the web export. MUST be a domain you own and that
 * resolves over HTTPS before you submit to either store.
 */
export const WEB_ORIGIN = (
  process.env.EXPO_PUBLIC_WEB_ORIGIN ?? 'https://macroleague.app'
).replace(/\/+$/, '');

export const SUPPORT_EMAIL =
  process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'nityanth.maramreddy@gmail.com';

export const PRIVACY_URL = `${WEB_ORIGIN}/privacy-policy.html`;

export const TERMS_URL = `${WEB_ORIGIN}/terms.html`;

/** Open a legal page: an in-app browser on native, a new tab on web. */
async function openUrl(url: string) {
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(url);
    } else {
      await WebBrowser.openBrowserAsync(url);
    }
  } catch {
    // Opening an external page should never crash the auth flow.
  }
}

export function openPrivacyPolicy() {
  return openUrl(PRIVACY_URL);
}

export function openTerms() {
  return openUrl(TERMS_URL);
}

/** Start a support email to the single support address. */
export function openSupportEmail() {
  return Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {
    // No mail client configured — nothing more we can do.
  });
}

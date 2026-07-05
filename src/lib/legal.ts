import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

/**
 * Single source of truth for MacroLeague's legal links and support contact.
 *
 * Apple and Google both require the Privacy Policy and Terms to live at stable,
 * publicly reachable HTTPS URLs (used in the store listing AND linked from inside
 * the app). The same pages also ship with the web export as static files
 * (`public/privacy-policy.html` and `public/terms.html`), so once the web app is
 * deployed to its own domain they are reachable at, e.g.:
 *
 *     https://<your-domain>/privacy-policy.html
 *     https://<your-domain>/terms.html
 *
 * The URLs below currently point at the published copies so the links work on
 * every platform today. When the production web domain is live, switch
 * PRIVACY_URL / TERMS_URL to that origin's `/privacy-policy.html` and `/terms.html`.
 *
 * There is intentionally NO support website — support is handled over email only.
 */
export const SUPPORT_EMAIL = 'nityanth.maramreddy@gmail.com';

export const PRIVACY_URL =
  'https://claude.ai/code/artifact/35b8b983-747c-4d66-a7f0-d5576cbf8d63';

export const TERMS_URL =
  'https://claude.ai/code/artifact/2ec780f9-c2d0-452a-aa02-bc2e6897f1a4';

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

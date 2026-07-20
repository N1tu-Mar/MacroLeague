import React from 'react';
import { registerRootComponent } from 'expo';

import { initMonitoring, wrapWithMonitoring } from './src/lib/monitoring';
import { initAnalytics } from './src/lib/analytics';
import ErrorBoundary from './src/components/ErrorBoundary';
import App from './App';

// Initialize crash/error reporting before anything renders (no-op without a DSN).
initMonitoring();

// Product analytics (Amplitude + TelemetryDeck). No-op without keys; this call
// only logs which providers are active in dev — events are tracked from the
// screens themselves.
initAnalytics();

/** App wrapped in the crash boundary. index.ts is .ts (not .tsx), so this uses
 *  createElement directly rather than JSX. */
function Root() {
  return React.createElement(ErrorBoundary, null, React.createElement(App));
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately.
//
// Two layers, and they do different jobs:
//   * ErrorBoundary CATCHES a render crash and shows a recoverable screen, so a
//     thrown error is no longer a permanent white screen.
//   * wrapWithMonitoring REPORTS to Sentry (a plain passthrough with no DSN).
// The boundary is inside the Sentry wrapper so Sentry still sees the error.
registerRootComponent(wrapWithMonitoring(Root));

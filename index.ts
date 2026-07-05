import { registerRootComponent } from 'expo';

import { initMonitoring, wrapWithMonitoring } from './src/lib/monitoring';
import { initAnalytics, track } from './src/lib/analytics';
import App from './App';

// Initialize crash/error reporting before anything renders (no-op without a DSN).
initMonitoring();

// Product analytics (Amplitude + TelemetryDeck). No-op without keys; this call
// only logs which providers are active in dev — events are tracked from the
// screens themselves.
initAnalytics();

// TEMPORARY — pipe check. Fires one `analytics_test` event on every app launch so
// you can confirm events reach the TelemetryDeck (and later Amplitude) dashboard
// before relying on real user actions. Delete this block once a signal lands.
track('analytics_test', { where: 'app_launch' });

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately. Wrapped so uncaught render errors are
// captured by Sentry (a plain passthrough when reporting is disabled).
registerRootComponent(wrapWithMonitoring(App));

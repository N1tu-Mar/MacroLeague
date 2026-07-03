import { registerRootComponent } from 'expo';

import { initMonitoring, wrapWithMonitoring } from './src/lib/monitoring';
import App from './App';

// Initialize crash/error reporting before anything renders (no-op without a DSN).
initMonitoring();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately. Wrapped so uncaught render errors are
// captured by Sentry (a plain passthrough when reporting is disabled).
registerRootComponent(wrapWithMonitoring(App));

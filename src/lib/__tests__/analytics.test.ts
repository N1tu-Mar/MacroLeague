// Behavioral tests for the analytics transport layer: the two provider payload
// shapes and the no-op-without-keys contract. Native modules and fetch are
// mocked so this runs in the plain-node jest environment.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__DEV__ = false;

// babel-preset-expo rewrites process.env.EXPO_PUBLIC_* reads through this virtual
// module (real file is ESM and untransformed in the node jest env). Point it at
// live process.env so loadAnalytics() can switch keys per test.
jest.mock('expo/virtual/env', () => ({ env: process.env }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'fixed-uuid' }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    }),
  };
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
  await new Promise<void>((r) => setImmediate(() => r()));
};

function loadAnalytics(env: Record<string, string | undefined>) {
  jest.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('../analytics');
}

describe('analytics transport', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(() => Promise.resolve({ ok: true }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchMock;
  });

  it('is a no-op and does not call fetch when no keys are set', async () => {
    const a = loadAnalytics({
      EXPO_PUBLIC_AMPLITUDE_API_KEY: undefined,
      EXPO_PUBLIC_TELEMETRYDECK_APP_ID: undefined,
    });
    expect(a.analyticsEnabled).toBe(false);
    a.track('some_event', { foo: 'bar' });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to both providers with the correct payloads when both keys are set', async () => {
    const a = loadAnalytics({
      EXPO_PUBLIC_AMPLITUDE_API_KEY: 'amp-key',
      EXPO_PUBLIC_TELEMETRYDECK_APP_ID: 'td-app-id',
    });
    expect(a.analyticsEnabled).toBe(true);

    a.identify('user-123');
    a.track('meal_logged', { is_first: true, meal_type: 'lunch' });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const byUrl = Object.fromEntries(
      fetchMock.mock.calls.map((c) => [c[0], JSON.parse(c[1].body)]),
    );

    const amp = byUrl['https://api2.amplitude.com/2/httpapi'];
    expect(amp.api_key).toBe('amp-key');
    expect(amp.events[0]).toMatchObject({
      user_id: 'user-123',
      device_id: 'fixed-uuid',
      event_type: 'meal_logged',
      platform: 'ios',
      event_properties: { is_first: true, meal_type: 'lunch' },
    });

    const td = byUrl['https://nom.telemetrydeck.com/v2/'];
    expect(td[0]).toMatchObject({
      appID: 'td-app-id',
      clientUser: 'user-123',
      type: 'meal_logged',
      // TelemetryDeck payload values are flattened to strings.
      payload: { is_first: 'true', meal_type: 'lunch', platform: 'ios' },
    });
  });

  it('only posts to the configured provider when a single key is set', async () => {
    const a = loadAnalytics({
      EXPO_PUBLIC_AMPLITUDE_API_KEY: 'amp-only',
      EXPO_PUBLIC_TELEMETRYDECK_APP_ID: undefined,
    });
    a.track('rewards_viewed', { balance: 10 });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api2.amplitude.com/2/httpapi');
  });

  it('falls back to the device id as clientUser when no user is identified', async () => {
    const a = loadAnalytics({
      EXPO_PUBLIC_AMPLITUDE_API_KEY: undefined,
      EXPO_PUBLIC_TELEMETRYDECK_APP_ID: 'td-app-id',
    });
    // no identify() → anonymous
    a.track('session_started', { is_returning: false });
    await flush();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body[0].clientUser).toBe('fixed-uuid');
    expect(body[0].payload).not.toHaveProperty('is_returning', undefined);
    expect(body[0].payload.is_returning).toBe('false');
  });
});

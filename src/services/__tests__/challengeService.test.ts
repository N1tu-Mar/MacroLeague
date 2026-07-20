jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import { deriveStatus } from '../challengeService';

/**
 * deriveStatus must use the UTC calendar day: the server writes start/end with
 * Postgres `current_date` (UTC) and scores over UTC-midnight windows. These
 * tests pin the clock to instants where UTC and common device zones disagree,
 * which is exactly where the old local-day version got it wrong.
 */
describe('deriveStatus', () => {
  afterEach(() => jest.useRealTimers());

  function at(iso: string) {
    jest.useFakeTimers({ now: new Date(iso) });
  }

  it('is active from start_date through end_date inclusive (UTC)', () => {
    at('2026-07-20T12:00:00Z');
    expect(deriveStatus('2026-07-20', '2026-07-22')).toBe('active');
    expect(deriveStatus('2026-07-18', '2026-07-20')).toBe('active');
  });

  it('is upcoming before start_date and completed after end_date', () => {
    at('2026-07-20T12:00:00Z');
    expect(deriveStatus('2026-07-21', '2026-07-23')).toBe('upcoming');
    expect(deriveStatus('2026-07-15', '2026-07-19')).toBe('completed');
  });

  it('uses the UTC day even when the device-local day lags behind', () => {
    // 03:00 UTC July 20 — a device in UTC-7 still shows July 19. A challenge
    // created moments ago has start_date 2026-07-20 (UTC current_date); the
    // old local-day logic told its own creator it was "upcoming".
    at('2026-07-20T03:00:00Z');
    expect(deriveStatus('2026-07-20', '2026-07-22')).toBe('active');
  });

  it('uses the UTC day even when the device-local day runs ahead', () => {
    // 20:00 UTC on end_date — a device in UTC+9 already shows the next day.
    // The scoring window is still open, so the challenge must still be active.
    at('2026-07-22T20:00:00Z');
    expect(deriveStatus('2026-07-20', '2026-07-22')).toBe('active');
  });

  it('flips exactly at UTC midnight after end_date', () => {
    at('2026-07-23T00:00:00Z');
    expect(deriveStatus('2026-07-20', '2026-07-22')).toBe('completed');
  });
});

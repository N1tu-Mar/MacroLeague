import { dateKeyInTimeZone, shiftDateKey, weekdayOfDateKey } from '../dates';

describe('dateKeyInTimeZone', () => {
  // 2026-07-20 03:00 UTC: still July 19 in Los Angeles, already July 20 in Tokyo.
  const instant = new Date('2026-07-20T03:00:00Z');

  it('resolves the calendar day in the given zone, not the device zone', () => {
    expect(dateKeyInTimeZone(instant, 'America/Los_Angeles')).toBe('2026-07-19');
    expect(dateKeyInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-07-20');
    expect(dateKeyInTimeZone(instant, 'UTC')).toBe('2026-07-20');
  });

  it('handles zones east of UTC crossing forward at their midnight', () => {
    // 13:30 UTC = 00:00 next day in Kiritimati (UTC+14).
    const edge = new Date('2026-07-20T10:00:00Z');
    expect(dateKeyInTimeZone(edge, 'Pacific/Kiritimati')).toBe('2026-07-21');
  });

  it('falls back to the device-local key for an invalid zone', () => {
    const d = new Date(2026, 6, 20, 12, 0, 0); // local noon — same day everywhere locally
    const localKey = '2026-07-20';
    expect(dateKeyInTimeZone(d, 'Not/AZone')).toBe(localKey);
  });

  it('falls back to the device-local key when the zone is null/undefined', () => {
    const d = new Date(2026, 6, 20, 12, 0, 0);
    expect(dateKeyInTimeZone(d, null)).toBe('2026-07-20');
    expect(dateKeyInTimeZone(d, undefined)).toBe('2026-07-20');
  });
});

describe('shiftDateKey', () => {
  it('steps back a day', () => {
    expect(shiftDateKey('2026-07-20', -1)).toBe('2026-07-19');
  });

  it('crosses month and year boundaries', () => {
    expect(shiftDateKey('2026-07-01', -1)).toBe('2026-06-30');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDateKey('2024-03-01', -1)).toBe('2024-02-29'); // leap year
  });

  it('steps forward too', () => {
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('is DST-immune: stepping across a transition never lands on the wrong day', () => {
    // 2026-03-08 is the US spring-forward date. Pure calendar math must not care.
    expect(shiftDateKey('2026-03-09', -1)).toBe('2026-03-08');
    expect(shiftDateKey('2026-03-08', -1)).toBe('2026-03-07');
  });
});

describe('weekdayOfDateKey', () => {
  it('returns the weekday of the key itself', () => {
    expect(weekdayOfDateKey('2026-07-20')).toBe(1); // Monday
    expect(weekdayOfDateKey('2026-07-19')).toBe(0); // Sunday
    expect(weekdayOfDateKey('2026-07-25')).toBe(6); // Saturday
  });
});

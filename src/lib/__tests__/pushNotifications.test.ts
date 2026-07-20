import {
  EXPO_PUSH_BATCH_LIMIT,
  DEFAULT_NOTIFICATION_PREFERENCES,
  normalizePreferences,
  isKindAllowed,
  chunk,
  localDateInTimeZone,
  localHourInTimeZone,
  needsStreakReminder,
  buildDedupeKey,
  isValidExpoPushToken,
  isDeviceNotRegistered,
  notificationCopy,
} from '../pushNotifications';

/**
 * The rules under test are the ones that decide whether a real human's phone
 * buzzes. The high-stakes ones are the local-date logic (a UTC bug would nudge
 * people on the wrong day, or claim they hadn't logged when they had) and the
 * dedupe key (a collision means either a missed reminder or a duplicate one).
 */

describe('chunk', () => {
  it('returns no batches for an empty list', () => {
    expect(chunk([])).toEqual([]);
  });

  it('keeps a list at the limit as a single batch', () => {
    const items = Array.from({ length: EXPO_PUSH_BATCH_LIMIT }, (_, i) => i);
    const batches = chunk(items);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(EXPO_PUSH_BATCH_LIMIT);
  });

  it('splits one past the limit into two batches', () => {
    const items = Array.from({ length: EXPO_PUSH_BATCH_LIMIT + 1 }, (_, i) => i);
    const batches = chunk(items);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(EXPO_PUSH_BATCH_LIMIT);
    expect(batches[1]).toHaveLength(1);
  });

  it('never emits a batch larger than the Expo limit', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);
    expect(chunk(items).every((b) => b.length <= EXPO_PUSH_BATCH_LIMIT)).toBe(true);
  });

  it('preserves every item exactly once and in order', () => {
    const items = Array.from({ length: 205 }, (_, i) => i);
    expect(chunk(items, 50).flat()).toEqual(items);
  });

  it('honours a custom size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('rejects a nonsensical size instead of looping forever', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow();
  });
});

describe('localDateInTimeZone', () => {
  it('uses the local day, not the UTC day, late in the evening', () => {
    // 2026-03-11T02:30:00Z is still 2026-03-10 (10:30pm EDT) in New York.
    const instant = new Date('2026-03-11T02:30:00Z');
    expect(localDateInTimeZone(instant, 'America/New_York')).toBe('2026-03-10');
    expect(instant.toISOString().slice(0, 10)).toBe('2026-03-11');
  });

  it('handles a timezone ahead of UTC rolling into the next day', () => {
    const instant = new Date('2026-03-10T22:00:00Z');
    expect(localDateInTimeZone(instant, 'Asia/Tokyo')).toBe('2026-03-11');
  });

  it('is correct across a US DST spring-forward boundary', () => {
    // DST began 2026-03-08 in the US; 06:30Z is 01:30 EST (still the 8th).
    expect(localDateInTimeZone(new Date('2026-03-08T06:30:00Z'), 'America/New_York')).toBe(
      '2026-03-08',
    );
    // ...and 07:30Z is 03:30 EDT, same local day, offset now -4.
    expect(localDateInTimeZone(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toBe(
      '2026-03-08',
    );
  });

  it('falls back to the UTC date for a garbage timezone rather than throwing', () => {
    expect(localDateInTimeZone(new Date('2026-03-11T02:30:00Z'), 'Not/AZone')).toBe('2026-03-11');
  });

  it('formats as zero-padded YYYY-MM-DD', () => {
    expect(localDateInTimeZone(new Date('2026-01-05T12:00:00Z'), 'UTC')).toBe('2026-01-05');
  });
});

describe('localHourInTimeZone', () => {
  it('reports the local hour', () => {
    expect(localHourInTimeZone(new Date('2026-03-11T02:30:00Z'), 'America/New_York')).toBe(22);
  });

  it('normalizes midnight to 0', () => {
    expect(localHourInTimeZone(new Date('2026-03-11T00:00:00Z'), 'UTC')).toBe(0);
  });

  it('falls back to UTC for a garbage timezone', () => {
    expect(localHourInTimeZone(new Date('2026-03-11T02:30:00Z'), 'Not/AZone')).toBe(2);
  });
});

describe('needsStreakReminder', () => {
  const now = new Date('2026-03-11T02:30:00Z'); // 10:30pm Mar 10 in New York

  it('does not remind a user who already logged on their local day', () => {
    expect(
      needsStreakReminder({ now, timeZone: 'America/New_York', activityDates: ['2026-03-10'] }),
    ).toBe(false);
  });

  it('reminds a user whose only activity is the UTC day, not their local day', () => {
    // The naive UTC implementation would see "2026-03-11" and call it logged.
    expect(
      needsStreakReminder({ now, timeZone: 'America/New_York', activityDates: ['2026-03-11'] }),
    ).toBe(true);
  });

  it('reminds a user with no activity at all', () => {
    expect(needsStreakReminder({ now, timeZone: 'America/New_York', activityDates: [] })).toBe(true);
  });

  it('is timezone-relative: the same instant differs per user', () => {
    const dates = ['2026-03-11'];
    expect(needsStreakReminder({ now, timeZone: 'Asia/Tokyo', activityDates: dates })).toBe(false);
    expect(needsStreakReminder({ now, timeZone: 'America/New_York', activityDates: dates })).toBe(
      true,
    );
  });
});

describe('buildDedupeKey', () => {
  const base = { kind: 'streak_reminder' as const, userId: 'u1', localDate: '2026-03-10' };

  it('is stable for the same user, kind and day', () => {
    expect(buildDedupeKey(base)).toBe(buildDedupeKey(base));
  });

  it('differs across days, so tomorrow is not deduped against today', () => {
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, localDate: '2026-03-11' }));
  });

  it('differs across users', () => {
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, userId: 'u2' }));
  });

  it('differs across kinds on the same day', () => {
    expect(buildDedupeKey(base)).not.toBe(buildDedupeKey({ ...base, kind: 'challenge_update' }));
  });

  it('scopes per-subject reminders so two challenges each get one', () => {
    const a = buildDedupeKey({ ...base, kind: 'challenge_update', subject: 'c1' });
    const b = buildDedupeKey({ ...base, kind: 'challenge_update', subject: 'c2' });
    expect(a).not.toBe(b);
    expect(a).toBe(buildDedupeKey({ ...base, kind: 'challenge_update', subject: 'c1' }));
  });

  it('treats a null subject as no subject', () => {
    expect(buildDedupeKey({ ...base, subject: null })).toBe(buildDedupeKey(base));
  });
});

describe('isValidExpoPushToken', () => {
  it('accepts a current Expo token', () => {
    expect(isValidExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
  });

  it('accepts the legacy ExpoPushToken form', () => {
    expect(isValidExpoPushToken('ExpoPushToken[abc123]')).toBe(true);
  });

  it.each([
    ['', 'empty string'],
    ['ExponentPushToken[]', 'empty payload'],
    ['fcm-raw-token', 'a raw FCM token'],
    ['ExponentPushToken[abc', 'an unterminated token'],
    [null, 'null'],
    [undefined, 'undefined'],
    [42, 'a number'],
  ])('rejects %p (%s)', (value, _label) => {
    expect(isValidExpoPushToken(value)).toBe(false);
  });
});

describe('normalizePreferences / isKindAllowed', () => {
  it('defaults everything on except the weekly report', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES).toEqual({
      streak_reminders: true,
      challenge_updates: true,
      friend_activity: true,
      weekly_report: false,
      rewards: true,
    });
  });

  it('fills a partial row from the defaults', () => {
    expect(normalizePreferences({ streak_reminders: false })).toEqual({
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      streak_reminders: false,
    });
  });

  it('ignores non-boolean and unknown values', () => {
    expect(
      normalizePreferences({ streak_reminders: 'yes', nope: true, weekly_report: true }),
    ).toEqual({ ...DEFAULT_NOTIFICATION_PREFERENCES, weekly_report: true });
  });

  it('returns the defaults for null/garbage input', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(normalizePreferences('nope')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('gates each kind on its own preference column', () => {
    const prefs = normalizePreferences({ streak_reminders: false });
    expect(isKindAllowed('streak_reminder', prefs)).toBe(false);
    expect(isKindAllowed('challenge_update', prefs)).toBe(true);
    expect(isKindAllowed('weekly_report', prefs)).toBe(false); // default-off
  });
});

describe('isDeviceNotRegistered', () => {
  it('detects a dead token', () => {
    expect(
      isDeviceNotRegistered({ status: 'error', details: { error: 'DeviceNotRegistered' } }),
    ).toBe(true);
  });

  it('does not treat other errors as dead tokens', () => {
    expect(isDeviceNotRegistered({ status: 'error', details: { error: 'MessageTooBig' } })).toBe(
      false,
    );
    expect(isDeviceNotRegistered({ status: 'error' })).toBe(false);
    expect(isDeviceNotRegistered({ status: 'ok', id: 'x' })).toBe(false);
  });
});

describe('notificationCopy', () => {
  it('names the streak length when there is one to protect', () => {
    expect(notificationCopy('streak_reminder', { streak: 6 }).title).toContain('6-day');
  });

  it('uses start-a-streak copy at zero', () => {
    expect(notificationCopy('streak_reminder', { streak: 0 }).title).toMatch(/start a streak/i);
  });

  it('says "ends today" when no days remain', () => {
    const copy = notificationCopy('challenge_update', { challenge_name: 'Protein Week', days_left: 0 });
    expect(copy.title).toBe('Protein Week ends today');
  });

  it('singularizes one day', () => {
    expect(
      notificationCopy('challenge_update', { challenge_name: 'X', days_left: 1 }).title,
    ).toBe('X ends in 1 day');
  });

  it('always returns non-empty title and body for every kind', () => {
    for (const kind of ['streak_reminder', 'challenge_update', 'friend_activity', 'weekly_report', 'reward'] as const) {
      const copy = notificationCopy(kind);
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.body.length).toBeGreaterThan(0);
    }
  });
});

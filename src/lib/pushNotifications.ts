// Pure push-notification logic — NO expo, NO supabase, NO react-native imports.
//
// Everything in this file is deliberately dependency-free so it can be unit
// tested under jest's `node` test environment (importing ../lib/supabase throws
// on missing env, and the expo packages are ESM/native). The service layer
// (src/services/notificationService.ts) and the `send-notifications` edge
// function both build on these helpers, so the rules that actually decide
// *whether* and *how often* a user is nudged live in one tested place.
//
// The two rules that matter for a streak app:
//   1. The "did they log today?" question is answered in the USER'S LOCAL DAY,
//      not UTC. A 9pm-ET reminder must not fire because UTC already rolled over.
//      Same convention as migration 0006, which stamps every ledger row with a
//      local date derived from profiles.timezone.
//   2. A reminder is keyed by (kind, user, local date, optional subject) so the
//      same nudge can never be queued twice for the same user on the same day,
//      no matter how many times the enqueue job runs.

/**
 * Expo's push API accepts at most 100 messages per request. Sending more in one
 * POST is rejected outright, so every send path must chunk.
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
export const EXPO_PUSH_BATCH_LIMIT = 100;

/** The notification kinds this app can send. Mirrors notification_preferences. */
export const NOTIFICATION_KINDS = [
  'streak_reminder',
  'challenge_update',
  'friend_activity',
  'weekly_report',
  'reward',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Preference flags, one per kind. Column names match the DB table exactly. */
export type NotificationPreferences = {
  streak_reminders: boolean;
  challenge_updates: boolean;
  friend_activity: boolean;
  weekly_report: boolean;
  rewards: boolean;
};

/**
 * Defaults. Everything is ON except the weekly report, which is the one purely
 * informational (non-retention) message — opt-in rather than opt-out. These are
 * duplicated as column defaults in migration 0023; keep the two in sync.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  streak_reminders: true,
  challenge_updates: true,
  friend_activity: true,
  weekly_report: false,
  rewards: true,
};

/** The preference column that gates a given kind. */
export const PREFERENCE_FOR_KIND: Record<NotificationKind, keyof NotificationPreferences> = {
  streak_reminder: 'streak_reminders',
  challenge_update: 'challenge_updates',
  friend_activity: 'friend_activity',
  weekly_report: 'weekly_report',
  reward: 'rewards',
};

/**
 * Coerce an arbitrary object (a server row, a cached blob) into a complete
 * preferences object. Unknown keys are dropped and non-boolean values fall back
 * to the default, so a partial or malformed row can never leave the UI showing
 * `undefined` switches or silently flip a user's choice.
 */
export function normalizePreferences(raw: unknown): NotificationPreferences {
  const out = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  if (!raw || typeof raw !== 'object') return out;
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof NotificationPreferences)[]) {
    if (typeof record[key] === 'boolean') out[key] = record[key] as boolean;
  }
  return out;
}

/** True when a user's preferences permit sending this kind of notification. */
export function isKindAllowed(
  kind: NotificationKind,
  preferences: NotificationPreferences,
): boolean {
  return preferences[PREFERENCE_FOR_KIND[kind]] === true;
}

/**
 * Split a list into chunks of at most `size` (default: Expo's 100-message
 * limit). Returns [] for an empty list — callers must never POST an empty batch.
 */
export function chunk<T>(items: readonly T[], size: number = EXPO_PUSH_BATCH_LIMIT): T[][] {
  if (size < 1) throw new Error('chunk size must be at least 1');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * The calendar date (YYYY-MM-DD) at `instant` in `timeZone`.
 *
 * Uses Intl rather than date arithmetic so DST and every offset are handled by
 * the platform's tz database. An unknown/garbage timezone string would make
 * Intl throw; we fall back to UTC instead, because a reminder sent on a
 * slightly-wrong day is far better than a crashed send job.
 */
export function localDateInTimeZone(instant: Date, timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is exactly the shape Postgres `date`
    // literals and our dedupe keys use.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

/** The local hour (0-23) at `instant` in `timeZone`. Falls back to UTC. */
export function localHourInTimeZone(instant: Date, timeZone: string): number {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hour12: false,
    }).format(instant);
    // Some ICU builds render midnight as "24"; normalize it to 0.
    return Number(hour) % 24;
  } catch {
    return instant.getUTCHours();
  }
}

/**
 * Whether a user still needs today's streak nudge: they have no activity row
 * for their own local date. `activityDates` is the set of YYYY-MM-DD dates the
 * user has logged on (user_daily_activity.activity_date).
 */
export function needsStreakReminder(opts: {
  now: Date;
  timeZone: string;
  activityDates: readonly string[];
}): boolean {
  const today = localDateInTimeZone(opts.now, opts.timeZone);
  return !opts.activityDates.includes(today);
}

/**
 * A stable, collision-resistant dedupe key for a queued notification.
 *
 * Shape: `<kind>:<userId>:<localDate>[:<subject>]`. The local date is what makes
 * "once per day" mean once per the USER'S day. `subject` scopes per-object
 * reminders (e.g. one challenge-ending nudge per challenge per day) — without it
 * a user in three ending challenges would get one reminder, with it they get
 * three, one per challenge, and still never a duplicate.
 *
 * The queue enforces this with a unique index, so this function only has to be
 * deterministic; it is not itself the guarantee.
 */
export function buildDedupeKey(opts: {
  kind: NotificationKind;
  userId: string;
  localDate: string;
  subject?: string | null;
}): string {
  const base = `${opts.kind}:${opts.userId}:${opts.localDate}`;
  return opts.subject ? `${base}:${opts.subject}` : base;
}

/**
 * Expo push tokens look like `ExponentPushToken[xxxxxxxx]` (or the older
 * `ExpoPushToken[...]`). Validating before storing keeps obvious junk — a FCM
 * token, an empty string, a device id — out of push_tokens, where it would only
 * ever produce failed sends.
 */
export function isValidExpoPushToken(token: unknown): token is string {
  return typeof token === 'string' && /^Expo(nent)?PushToken\[[^\s\]]+\]$/.test(token);
}

/** A single ticket as returned by the Expo push API. */
export type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
};

/**
 * True when a ticket says the token is dead (app uninstalled, or the push
 * credential was revoked). This is the ONE error we act on structurally: the
 * token must be disabled or we will retry it forever.
 */
export function isDeviceNotRegistered(ticket: ExpoPushTicket): boolean {
  return ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
}

/** Copy for each notification kind. Kept here so the sender and any preview UI agree. */
export function notificationCopy(
  kind: NotificationKind,
  data: Record<string, unknown> = {},
): { title: string; body: string } {
  switch (kind) {
    case 'streak_reminder': {
      const streak = typeof data.streak === 'number' ? data.streak : 0;
      return {
        title: streak > 0 ? `Keep your ${streak}-day streak alive` : 'Log a meal to start a streak',
        body:
          streak > 0
            ? "You haven't logged today. One meal secures the streak."
            : 'Log your first meal of the day and get on the board.',
      };
    }
    case 'challenge_update': {
      const name = typeof data.challenge_name === 'string' ? data.challenge_name : 'Your challenge';
      const days = typeof data.days_left === 'number' ? data.days_left : 0;
      return {
        title: days <= 0 ? `${name} ends today` : `${name} ends in ${days} day${days === 1 ? '' : 's'}`,
        body: 'Log now to move up the standings before it closes.',
      };
    }
    case 'friend_activity':
      return { title: 'MacroLeague', body: 'You have new friend activity.' };
    case 'weekly_report':
      return { title: 'Your week in MacroLeague', body: 'Scores, streak and rank — see how you did.' };
    case 'reward':
      return { title: 'Rewards', body: 'You have enough points to redeem a reward.' };
  }
}

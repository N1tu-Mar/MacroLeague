import { formatInTimeZone } from 'date-fns-tz';

/**
 * Calendar-day keys (`YYYY-MM-DD`) for rows bucketed by PROFILE timezone.
 *
 * `user_daily_activity` is keyed server-side to the user's saved profile
 * timezone, not the device's. Building keys from the device clock (the old
 * `dateKey()` pattern) silently shifts the Home "vs yesterday" delta and the
 * Profile 7-day chart by a day whenever the two disagree — a traveling user,
 * or a profile timezone that went stale.
 */

/** The `YYYY-MM-DD` key for `date` as seen in `timeZone`. Falls back to the
 *  device-local day if the zone string is invalid — a bad stored timezone must
 *  degrade to the old behavior, never crash Home. */
export function dateKeyInTimeZone(date: Date, timeZone: string | null | undefined): string {
  if (timeZone) {
    try {
      return formatInTimeZone(date, timeZone, 'yyyy-MM-dd');
    } catch {
      // Invalid IANA name — fall through to the device-local key.
    }
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Steps a `YYYY-MM-DD` key backwards by whole calendar days using pure UTC
 * math. Once "today" is pinned to the right zone, day arithmetic must not
 * touch a clock again — subtracting 24h from a timestamp lands on the wrong
 * day across DST transitions.
 */
export function shiftDateKey(key: string, days: number): string {
  const base = new Date(`${key}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** 0–6, Sunday-first — the weekday of a `YYYY-MM-DD` key itself, independent
 *  of any timezone (the key already IS the calendar day). */
export function weekdayOfDateKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/**
 * Age gating for sign-up.
 *
 * WHY THIS EXISTS: MacroLeague is a social app (friends, leaderboards, an
 * activity feed) that collects health and fitness data. There was previously NO
 * age check of any kind at sign-up. That is a COPPA problem in the US, and both
 * app stores require an accurate age rating with a plausible mechanism behind it.
 *
 * DESIGN — this is a "neutral age screen":
 *   * It asks for a date of birth WITHOUT hinting at the threshold. A form that
 *     says "you must be 13+" teaches the user which answer unlocks the app, so
 *     it collects nothing meaningful. The field is neutral and the rejection
 *     message never reveals the cutoff either.
 *   * Only the BIRTH YEAR is persisted, plus a verification timestamp. A full
 *     date of birth is stronger PII than the check needs, and holding less of it
 *     is the right default for a product whose users are mostly students.
 *   * The gate is client-side and self-declared. That is what the regulation
 *     contemplates and what every comparable app does; it is not, and cannot be,
 *     proof of age.
 *
 * Pure and dependency-free so it can be unit tested — no React Native, no
 * Supabase imports.
 */

/** Minimum age to create an account. */
export const MIN_AGE_YEARS = 13;

/** Oldest plausible birth year, to catch typos like 1089. */
const MIN_BIRTH_YEAR = 1900;

export interface ParsedBirthDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export type AgeCheckResult =
  | { status: 'ok'; age: number; birthYear: number }
  | { status: 'incomplete' }
  | { status: 'invalid'; message: string }
  | { status: 'underage'; message: string };

/**
 * Parses a date of birth from three separate field values.
 *
 * Returns null when any part is missing or non-numeric. Rejects impossible
 * calendar dates (Feb 30, month 13) by round-tripping through Date rather than
 * hand-rolling per-month day counts — this gets leap years right for free.
 */
export function parseBirthDate(
  month: string,
  day: string,
  year: string,
): ParsedBirthDate | null {
  const m = Number(month.trim());
  const d = Number(day.trim());
  const y = Number(year.trim());

  if (!Number.isInteger(m) || !Number.isInteger(d) || !Number.isInteger(y)) return null;
  if (month.trim() === '' || day.trim() === '' || year.trim() === '') return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (y < MIN_BIRTH_YEAR) return null;

  // Round-trip: if any component changed, the date did not exist.
  const probe = new Date(y, m - 1, d);
  if (
    probe.getFullYear() !== y ||
    probe.getMonth() !== m - 1 ||
    probe.getDate() !== d
  ) {
    return null;
  }

  return { year: y, month: m, day: d };
}

/**
 * Whole years elapsed between a birth date and `now`.
 *
 * Compares month/day explicitly rather than dividing elapsed milliseconds by
 * 365.25 — that approximation is off by a day around leap years and would let
 * someone through (or block them) on their birthday.
 */
export function ageOn(birth: ParsedBirthDate, now: Date = new Date()): number {
  let age = now.getFullYear() - birth.year;

  const monthDiff = now.getMonth() + 1 - birth.month;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.day)) {
    age -= 1;
  }

  return age;
}

/**
 * The full gate: parse, sanity-check, and apply the minimum age.
 *
 * `now` is injectable so the behavior on a birthday is testable rather than
 * dependent on when the suite happens to run.
 */
export function checkAge(
  month: string,
  day: string,
  year: string,
  now: Date = new Date(),
): AgeCheckResult {
  if (!month.trim() && !day.trim() && !year.trim()) {
    return { status: 'incomplete' };
  }
  if (!month.trim() || !day.trim() || !year.trim()) {
    return { status: 'incomplete' };
  }

  const birth = parseBirthDate(month, day, year);
  if (!birth) {
    return { status: 'invalid', message: 'Enter a valid date of birth.' };
  }

  const age = ageOn(birth, now);

  if (age < 0 || birth.year > now.getFullYear()) {
    return { status: 'invalid', message: 'Enter a valid date of birth.' };
  }
  if (age > 120) {
    return { status: 'invalid', message: 'Enter a valid date of birth.' };
  }

  if (age < MIN_AGE_YEARS) {
    // Deliberately does NOT state the threshold — see the neutral-screen note
    // above. Revealing it just tells the user which year to type instead.
    return {
      status: 'underage',
      message: "Sorry, you're not eligible to create an account.",
    };
  }

  return { status: 'ok', age, birthYear: birth.year };
}

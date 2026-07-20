/**
 * Pure helpers for the server-issued reward redemption pass.
 *
 * Deliberately free of any supabase import: jest runs with testEnvironment
 * 'node' and importing src/lib/supabase there throws on missing env, so every
 * piece of logic worth testing lives here and the service layer stays a thin
 * transport shell around it.
 */

/**
 * The alphabet migration 0022's generate_reward_code() draws from: digits 2-9
 * plus A-Z without I and O. Mirrored here so the client can reject an
 * obviously-malformed code (a bad OCR scan, a mistyped entry) without a round
 * trip. It is a shape check only — the server is still the authority on
 * whether a code exists.
 */
export const REWARD_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Length of a server-issued code, matching issue_reward_code(12). */
export const REWARD_CODE_LENGTH = 12;

/**
 * Strips the cosmetic grouping the UI adds (and anything a scanner may have
 * picked up around it), then upcases. Mirrors the regexp_replace inside
 * validate_reward_code so what we display always round-trips to what is stored.
 */
export function normalizeRewardCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * True when a string could be a server-issued code. Checks the alphabet as
 * well as the length, so a 12-char string containing O or I (the characters
 * the generator deliberately avoids) is caught as a likely misread of 0 or 1.
 */
export function isValidRewardCode(raw: string): boolean {
  const code = normalizeRewardCode(raw);
  if (code.length !== REWARD_CODE_LENGTH) return false;
  for (const ch of code) {
    if (!REWARD_CODE_ALPHABET.includes(ch)) return false;
  }
  return true;
}

/**
 * Groups a code into blocks of four for display: ABCD-EFGH-JKLM. A till
 * operator reading a code aloud or typing it in chunks makes fewer mistakes
 * than one tracking twelve unbroken characters. The dashes are presentation
 * only — never send this form to the server, send normalizeRewardCode().
 */
export function formatRewardCode(raw: string, groupSize = 4): string {
  const code = normalizeRewardCode(raw);
  if (code.length === 0) return '';
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += groupSize) {
    groups.push(code.slice(i, i + groupSize));
  }
  return groups.join('-');
}

/** Status values mirroring reward_redemptions.status in migration 0022. */
export type RewardPassStatus = 'issued' | 'redeemed' | 'expired' | 'void';

/**
 * Whether a pass has aged out. Compares the timestamp rather than trusting the
 * status column, exactly as validate_reward_code() does: the housekeeping
 * sweep that relabels rows to 'expired' is cosmetic and may not have run, so a
 * pass whose expires_at has passed must read as expired regardless.
 */
export function isPassExpired(expiresAt: string | null, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry <= now.getTime();
}

/**
 * Whether the pass is still presentable at a register. This is the single
 * predicate the UI should branch on — it folds the status column and the
 * timestamp together so no caller has to remember to check both.
 */
export function isPassActive(
  status: RewardPassStatus,
  expiresAt: string | null,
  now: Date = new Date(),
): boolean {
  return status === 'issued' && !isPassExpired(expiresAt, now);
}

/**
 * Whole days remaining before a pass expires, floored, never negative. Used
 * for the "expires in N days" nudge; returns null when there is no expiry.
 */
export function daysUntilExpiry(expiresAt: string | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const expiry = Date.parse(expiresAt);
  if (Number.isNaN(expiry)) return null;
  const ms = expiry - now.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Human-readable expiry line for the pass sheet. Kept here rather than inline
 * in the screen so the wording is testable and consistent between the pass
 * sheet and any future "my passes" list.
 */
export function describePassExpiry(
  status: RewardPassStatus,
  expiresAt: string | null,
  now: Date = new Date(),
): string {
  if (status === 'redeemed') return 'Already redeemed';
  if (status === 'void') return 'No longer valid';
  if (!expiresAt) return '';
  if (isPassExpired(expiresAt, now)) return 'Expired';

  const days = daysUntilExpiry(expiresAt, now);
  const date = new Date(expiresAt).toLocaleDateString();
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  if (days !== null && days <= 7) return `Expires in ${days} days`;
  return `Expires ${date}`;
}

/**
 * Pure helpers for linked social accounts (Instagram / Snapchat / TikTok).
 *
 * Deliberately free of any Supabase or React Native import so it stays unit
 * testable and usable from anywhere — socialFeedService re-exports these
 * alongside the network calls.
 *
 * THE CORE RULE: a handle is stored BARE and the profile URL is always built
 * here from a fixed per-platform template. Storing a user-supplied URL would let
 * one user point every viewer's browser at an arbitrary host. This mirrors the
 * DB-side anchored format constraints in migration 0021 — the client validates
 * for UX, the database is authoritative.
 */

export interface SocialHandles {
  instagram: string | null;
  snapchat: string | null;
  tiktok: string | null;
}

export type SocialPlatform = keyof SocialHandles;

export const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'snapchat', 'tiktok'];

export const EMPTY_SOCIAL_HANDLES: SocialHandles = {
  instagram: null,
  snapchat: null,
  tiktok: null,
};

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  snapchat: 'Snapchat',
  tiktok: 'TikTok',
};

const PROFILE_URL: Record<SocialPlatform, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${encodeURIComponent(h)}`,
  snapchat: (h) => `https://snapchat.com/add/${encodeURIComponent(h)}`,
  tiktok: (h) => `https://tiktok.com/@${encodeURIComponent(h)}`,
};

/** Client-side mirror of the DB CHECK constraints (migration 0021). */
const HANDLE_PATTERN: Record<SocialPlatform, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  snapchat: /^[A-Za-z0-9._-]{3,15}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
};

export const HANDLE_RULES: Record<SocialPlatform, string> = {
  instagram: 'Letters, numbers, periods and underscores, up to 30 characters.',
  snapchat: '3–15 characters: letters, numbers, periods, hyphens and underscores.',
  tiktok: '2–24 characters: letters, numbers, periods and underscores.',
};

/**
 * Normalize whatever the user pasted into a bare handle.
 *
 * Accepts "@name", "instagram.com/name", a full profile URL with query string,
 * or an already-bare handle — users paste all of these. Returns null for input
 * that reduces to nothing.
 *
 * This is a convenience, NOT a security boundary: it makes well-intentioned
 * input work. Anything hostile is caught by isValidHandle() and, authoritatively,
 * by the database constraint.
 */
export function normalizeHandle(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/^https?:\/\//i, '');

  // Reduce a URL-ish value to its last non-empty path segment.
  if (value.includes('/')) {
    const segments = value.split('/').filter(Boolean);
    value = segments[segments.length - 1] ?? '';
  }

  value = value.replace(/^@/, '').trim();
  // Drop anything a copied link carried after the handle itself.
  value = value.split('?')[0].split('#')[0];

  return value.length > 0 ? value : null;
}

export function isValidHandle(platform: SocialPlatform, handle: string): boolean {
  return HANDLE_PATTERN[platform].test(handle);
}

export function profileUrlFor(platform: SocialPlatform, handle: string): string {
  return PROFILE_URL[platform](handle);
}

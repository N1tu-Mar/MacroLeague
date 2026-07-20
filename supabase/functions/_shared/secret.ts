// Shared secret verification for cron-gated functions.
//
// Two properties matter here:
//  1. FAIL CLOSED: a missing/empty configured secret must never authorize a
//     caller. Otherwise an unset env var silently opens a destructive endpoint.
//  2. CONSTANT TIME: compare all bytes regardless of where they first differ,
//     so response latency can't be used to recover the secret byte-by-byte.
//     `===`/`!==` short-circuit on the first mismatch and leak that timing.
//
// The length check happens before the timed compare on purpose: comparing
// buffers of different lengths can't be done in constant time anyway, and the
// secret's length is not itself sensitive.

/**
 * True only when `provided` matches the non-empty `configured` secret. Any of
 * {configured unset/empty, provided null, length mismatch, byte mismatch}
 * returns false.
 */
export function verifyCronSecret(
  configured: string | undefined | null,
  provided: string | null | undefined,
): boolean {
  if (!configured) return false; // fail closed when unset
  if (!provided) return false;

  const a = new TextEncoder().encode(configured);
  const b = new TextEncoder().encode(provided);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// Run with:  deno test supabase/functions/_shared/
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifyCronSecret } from './secret.ts';

Deno.test('rejects when the configured secret is unset (fail closed)', () => {
  // The whole point: an unset env var must never authorize a caller.
  assert(!verifyCronSecret(undefined, 'anything'));
  assert(!verifyCronSecret(null, 'anything'));
  assert(!verifyCronSecret('', 'anything'));
});

Deno.test('rejects a missing or empty provided value', () => {
  assert(!verifyCronSecret('the-real-secret', null));
  assert(!verifyCronSecret('the-real-secret', undefined));
  assert(!verifyCronSecret('the-real-secret', ''));
});

Deno.test('rejects a wrong secret', () => {
  assert(!verifyCronSecret('the-real-secret', 'the-wrong-secret'));
});

Deno.test('rejects a length mismatch (prefix of the real secret)', () => {
  assert(!verifyCronSecret('the-real-secret', 'the-real'));
  assert(!verifyCronSecret('the-real-secret', 'the-real-secret-and-more'));
});

Deno.test('accepts the exact secret', () => {
  assert(verifyCronSecret('the-real-secret', 'the-real-secret'));
  const hex = 'a'.repeat(64);
  assert(verifyCronSecret(hex, hex));
});

Deno.test('is case- and byte-sensitive', () => {
  assert(!verifyCronSecret('Secret', 'secret'));
  assert(!verifyCronSecret('secretA', 'secretB'));
});

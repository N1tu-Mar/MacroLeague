// Tests for origin enforcement. Run with:  deno test supabase/functions/_shared/
//
// The property that matters most here is the one at the bottom: a NATIVE caller
// (no Origin header) must never be blocked. Getting that wrong would break every
// iOS and Android user while looking fine on web.

import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  corsHeadersFor,
  rejectDisallowedOrigin,
  preflightResponse,
  patternToRegExp,
} from './cors.ts';

function reqFrom(origin?: string): Request {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  return new Request('https://example.functions.supabase.co/chat', {
    method: 'POST',
    headers,
  });
}

Deno.test('echoes an allow-listed origin back exactly', () => {
  const headers = corsHeadersFor(reqFrom('https://macroleague.app'));
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://macroleague.app');
});

Deno.test('never emits a wildcard origin', () => {
  for (const origin of [
    'https://macroleague.app',
    'https://evil.example.com',
    undefined,
  ]) {
    const headers = corsHeadersFor(reqFrom(origin));
    assert(
      headers['Access-Control-Allow-Origin'] !== '*',
      `wildcard leaked for origin=${origin}`,
    );
  }
});

Deno.test('withholds the ACAO header for a non-allow-listed origin', () => {
  const headers = corsHeadersFor(reqFrom('https://evil.example.com'));
  assertEquals(headers['Access-Control-Allow-Origin'], undefined);
});

Deno.test('always sets Vary: Origin so caches cannot cross-serve', () => {
  assertEquals(corsHeadersFor(reqFrom('https://macroleague.app')).Vary, 'Origin');
  assertEquals(corsHeadersFor(reqFrom()).Vary, 'Origin');
});

Deno.test('tolerates a trailing slash on the origin', () => {
  const headers = corsHeadersFor(reqFrom('https://macroleague.app/'));
  assertEquals(headers['Access-Control-Allow-Origin'], 'https://macroleague.app');
});

Deno.test('rejectDisallowedOrigin BLOCKS a disallowed browser origin with 403', async () => {
  const rejection = rejectDisallowedOrigin(reqFrom('https://evil.example.com'));

  assert(rejection !== null, 'a disallowed origin must be refused, not merely unreadable');
  assertEquals(rejection!.status, 403);
  // The rejection itself must not hand the attacker a readable response either.
  assertEquals(rejection!.headers.get('Access-Control-Allow-Origin'), null);
  const body = await rejection!.json();
  assertEquals(body.error, 'Origin not allowed.');
});

Deno.test('rejectDisallowedOrigin ALLOWS an allow-listed browser origin', () => {
  assertEquals(rejectDisallowedOrigin(reqFrom('https://macroleague.app')), null);
});

Deno.test('rejectDisallowedOrigin ALLOWS a request with no Origin header', () => {
  // React Native sends no Origin and does not enforce CORS. If this ever returns
  // a Response, every native user is locked out of the app.
  assertEquals(
    rejectDisallowedOrigin(reqFrom()),
    null,
    'native callers must never be blocked by origin checks',
  );
});

Deno.test('localhost dev origins are allowed by default', () => {
  assertEquals(rejectDisallowedOrigin(reqFrom('http://localhost:8081')), null);
});

Deno.test('a look-alike origin is not allowed', () => {
  // Substring/prefix matching would let these through; exact set membership must not.
  for (const origin of [
    'https://macroleague.app.evil.com',
    'https://notmacroleague.app',
    'http://macroleague.app',
  ]) {
    assert(
      rejectDisallowedOrigin(reqFrom(origin)) !== null,
      `${origin} must not be treated as allow-listed`,
    );
  }
});

Deno.test('preflight response carries the CORS headers', () => {
  const res = preflightResponse(reqFrom('https://macroleague.app'));
  assertEquals(res.headers.get('Access-Control-Allow-Origin'), 'https://macroleague.app');
  assert(res.headers.get('Access-Control-Allow-Headers')!.includes('authorization'));
  assert(res.headers.get('Access-Control-Allow-Methods')!.includes('POST'));
});

// --- Wildcard entries (Vercel-style rotating preview URLs) -------------------
//
// ALLOWED_ORIGINS is read at module load, so these exercise the pattern
// compiler directly rather than reloading the module per case. The compiler is
// the whole security boundary for wildcard entries.

Deno.test('wildcard matches a rotating preview URL for the same project', () => {
  const re = patternToRegExp('https://macroleague-*.vercel.app');
  assert(re.test('https://macroleague-abc123-nitu.vercel.app'));
  assert(re.test('https://macroleague-git-main-nitu.vercel.app'));
});

Deno.test('wildcard does NOT match across a dot', () => {
  // The critical property. If `*` matched dots, a scoped pattern would also
  // accept attacker-controlled hostnames that merely embed the expected text.
  const re = patternToRegExp('https://macroleague-*.vercel.app');
  for (const origin of [
    'https://macroleague-x.evil.com',
    'https://macroleague-x.attacker.net.vercel.app.evil.com',
    'https://macroleague-x.sub.vercel.app',
  ]) {
    assert(!re.test(origin), `${origin} must not match a scoped wildcard`);
  }
});

Deno.test('wildcard is anchored at both ends', () => {
  const re = patternToRegExp('https://macroleague-*.vercel.app');
  assert(!re.test('https://evil.com/https://macroleague-x.vercel.app'));
  assert(!re.test('https://macroleague-x.vercel.app.evil.com'));
  assert(!re.test('prefix-https://macroleague-x.vercel.app'));
});

Deno.test('wildcard requires at least one character', () => {
  // `https://-.vercel.app` should not satisfy `macroleague-*`.
  const re = patternToRegExp('https://macroleague-*.vercel.app');
  assert(!re.test('https://macroleague-.vercel.app'));
});

Deno.test('regex metacharacters in a pattern are escaped, not interpreted', () => {
  // A naive implementation would let `.` match any char, so `macroleagueXapp`
  // would be accepted as `macroleague.app`.
  const re = patternToRegExp('https://macroleague-*.vercel.app');
  assert(!re.test('https://macroleague-xXvercelXapp'));

  const literal = patternToRegExp('https://a+b.example.com');
  assert(literal.test('https://a+b.example.com'));
  assert(!literal.test('https://aaab.example.com'));
});

Deno.test('a pattern with no wildcard behaves as an exact match', () => {
  const re = patternToRegExp('https://macroleague.app');
  assert(re.test('https://macroleague.app'));
  assert(!re.test('https://macroleague.app.evil.com'));
  assert(!re.test('https://notmacroleague.app'));
});

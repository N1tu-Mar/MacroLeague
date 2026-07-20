import {
  normalizeHandle,
  isValidHandle,
  profileUrlFor,
} from '../socialHandles';

/**
 * Handles are stored BARE and the profile URL is built from a fixed template.
 * The tests that matter most here are the ones proving a stored handle can never
 * carry its own scheme or host — that is what stops a linked account becoming an
 * open redirect for everyone who views that profile.
 */

describe('normalizeHandle', () => {
  it('accepts a bare handle unchanged', () => {
    expect(normalizeHandle('nityanth')).toBe('nityanth');
  });

  it('strips a leading @', () => {
    expect(normalizeHandle('@nityanth')).toBe('nityanth');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeHandle('   nityanth  ')).toBe('nityanth');
  });

  it('reduces a full profile URL to the handle', () => {
    expect(normalizeHandle('https://instagram.com/nityanth')).toBe('nityanth');
    expect(normalizeHandle('http://www.tiktok.com/@nityanth')).toBe('nityanth');
    expect(normalizeHandle('snapchat.com/add/nityanth')).toBe('nityanth');
  });

  it('ignores a trailing slash on a pasted URL', () => {
    expect(normalizeHandle('https://instagram.com/nityanth/')).toBe('nityanth');
  });

  it('drops a tracking query string from a copied link', () => {
    expect(normalizeHandle('https://instagram.com/nityanth?igsh=abc123')).toBe('nityanth');
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(normalizeHandle('')).toBeNull();
    expect(normalizeHandle('   ')).toBeNull();
    expect(normalizeHandle('@')).toBeNull();
  });
});

describe('handle validation rejects anything that could redirect', () => {
  // These are the cases that would matter if a handle were ever concatenated
  // into a URL without a template.
  const hostile = [
    'evil.com/phish',
    'https://evil.com',
    '../../etc/passwd',
    'name?next=https://evil.com',
    'name#fragment',
    'name/../other',
    'na me',
    'name<script>',
  ];

  it.each(hostile)('rejects %s for instagram', (value) => {
    expect(isValidHandle('instagram', value)).toBe(false);
  });

  it.each(hostile)('rejects %s for tiktok', (value) => {
    expect(isValidHandle('tiktok', value)).toBe(false);
  });

  it.each(hostile)('rejects %s for snapchat', (value) => {
    expect(isValidHandle('snapchat', value)).toBe(false);
  });
});

describe('isValidHandle enforces each platform’s real rules', () => {
  it('accepts valid instagram handles', () => {
    expect(isValidHandle('instagram', 'nityanth')).toBe(true);
    expect(isValidHandle('instagram', 'nity.anth_1')).toBe(true);
    expect(isValidHandle('instagram', 'a')).toBe(true);
  });

  it('rejects an instagram handle over 30 characters', () => {
    expect(isValidHandle('instagram', 'a'.repeat(30))).toBe(true);
    expect(isValidHandle('instagram', 'a'.repeat(31))).toBe(false);
  });

  it('enforces snapchat’s 3-character minimum', () => {
    expect(isValidHandle('snapchat', 'ab')).toBe(false);
    expect(isValidHandle('snapchat', 'abc')).toBe(true);
    expect(isValidHandle('snapchat', 'a'.repeat(16))).toBe(false);
  });

  it('allows hyphens on snapchat but not on instagram or tiktok', () => {
    expect(isValidHandle('snapchat', 'nity-anth')).toBe(true);
    expect(isValidHandle('instagram', 'nity-anth')).toBe(false);
    expect(isValidHandle('tiktok', 'nity-anth')).toBe(false);
  });
});

describe('profileUrlFor', () => {
  it('builds each platform URL from a fixed template', () => {
    expect(profileUrlFor('instagram', 'nityanth')).toBe('https://instagram.com/nityanth');
    expect(profileUrlFor('snapchat', 'nityanth')).toBe('https://snapchat.com/add/nityanth');
    expect(profileUrlFor('tiktok', 'nityanth')).toBe('https://tiktok.com/@nityanth');
  });

  it('always produces a URL on the intended host', () => {
    // Even if a hostile value somehow bypassed validation and the DB constraint,
    // encoding keeps it inside the path of the correct origin.
    const url = profileUrlFor('instagram', 'evil.com/phish');
    expect(url.startsWith('https://instagram.com/')).toBe(true);
    expect(url).not.toContain('//evil.com');
  });
});

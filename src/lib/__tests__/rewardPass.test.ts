import {
  REWARD_CODE_ALPHABET,
  REWARD_CODE_LENGTH,
  normalizeRewardCode,
  isValidRewardCode,
  formatRewardCode,
  isPassExpired,
  isPassActive,
  daysUntilExpiry,
  describePassExpiry,
} from '../rewardPass';

const NOW = new Date('2026-07-20T12:00:00.000Z');
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe('reward code alphabet', () => {
  it('is exactly 32 symbols, which is what makes the server mapping unbiased', () => {
    expect(REWARD_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(REWARD_CODE_ALPHABET).size).toBe(32);
  });

  it('excludes the characters a human confuses when reading a code aloud', () => {
    for (const ch of ['O', '0', 'I', '1']) {
      expect(REWARD_CODE_ALPHABET).not.toContain(ch);
    }
  });
});

describe('normalizeRewardCode', () => {
  it('strips the display grouping so it round-trips to the stored form', () => {
    expect(normalizeRewardCode('ABCD-EFGH-JKLM')).toBe('ABCDEFGHJKLM');
  });

  it('upcases and trims what a till operator might type', () => {
    expect(normalizeRewardCode('  abcd efgh jklm ')).toBe('ABCDEFGHJKLM');
  });

  it('is idempotent', () => {
    const once = normalizeRewardCode('ab-cd ef');
    expect(normalizeRewardCode(once)).toBe(once);
  });
});

describe('isValidRewardCode', () => {
  it('accepts a well-formed server code in either display or raw form', () => {
    expect(isValidRewardCode('ABCDEFGHJKLM')).toBe(true);
    expect(isValidRewardCode('ABCD-EFGH-JKLM')).toBe(true);
  });

  it('rejects the wrong length', () => {
    expect(isValidRewardCode('ABCDEFGHJKL')).toBe(false);
    expect(isValidRewardCode('ABCDEFGHJKLMN')).toBe(false);
    expect(isValidRewardCode('')).toBe(false);
  });

  it('rejects excluded characters, catching an O/0 or I/1 misread', () => {
    expect(isValidRewardCode('ABCDEFGHJKLO')).toBe(false);
    expect(isValidRewardCode('ABCDEFGHJKLI')).toBe(false);
  });

  it('agrees with the declared code length', () => {
    expect(REWARD_CODE_LENGTH).toBe(12);
    expect(isValidRewardCode('A'.repeat(REWARD_CODE_LENGTH))).toBe(true);
  });
});

describe('formatRewardCode', () => {
  it('groups into fours for readability at a register', () => {
    expect(formatRewardCode('ABCDEFGHJKLM')).toBe('ABCD-EFGH-JKLM');
  });

  it('re-groups an already-formatted code rather than doubling the dashes', () => {
    expect(formatRewardCode('ABCD-EFGH-JKLM')).toBe('ABCD-EFGH-JKLM');
  });

  it('leaves a trailing partial group intact', () => {
    expect(formatRewardCode('ABCDEF')).toBe('ABCD-EF');
  });

  it('returns empty for empty input rather than a stray dash', () => {
    expect(formatRewardCode('')).toBe('');
    expect(formatRewardCode('---')).toBe('');
  });
});

describe('isPassExpired', () => {
  it('is false while the window is open', () => {
    expect(isPassExpired(inDays(5), NOW)).toBe(false);
  });

  it('is true once expires_at has passed', () => {
    expect(isPassExpired(inDays(-1), NOW)).toBe(true);
  });

  it('treats the exact boundary as expired, matching the server <= comparison', () => {
    expect(isPassExpired(NOW.toISOString(), NOW)).toBe(true);
  });

  it('does not expire on a null or unparseable timestamp', () => {
    expect(isPassExpired(null, NOW)).toBe(false);
    expect(isPassExpired('not-a-date', NOW)).toBe(false);
  });
});

describe('isPassActive', () => {
  it('is true only for an issued, unexpired pass', () => {
    expect(isPassActive('issued', inDays(10), NOW)).toBe(true);
  });

  it('is false for an issued pass whose timestamp has passed, even though the sweep may not have relabelled it', () => {
    expect(isPassActive('issued', inDays(-1), NOW)).toBe(false);
  });

  it('is false for every terminal status regardless of the expiry window', () => {
    expect(isPassActive('redeemed', inDays(10), NOW)).toBe(false);
    expect(isPassActive('void', inDays(10), NOW)).toBe(false);
    expect(isPassActive('expired', inDays(10), NOW)).toBe(false);
  });
});

describe('daysUntilExpiry', () => {
  it('floors partial days', () => {
    expect(daysUntilExpiry(new Date(NOW.getTime() + 2.9 * 86_400_000).toISOString(), NOW)).toBe(2);
  });

  it('never goes negative', () => {
    expect(daysUntilExpiry(inDays(-9), NOW)).toBe(0);
  });

  it('is null when there is no expiry', () => {
    expect(daysUntilExpiry(null, NOW)).toBeNull();
  });
});

describe('describePassExpiry', () => {
  it('reports terminal states before considering the date', () => {
    expect(describePassExpiry('redeemed', inDays(10), NOW)).toBe('Already redeemed');
    expect(describePassExpiry('void', inDays(10), NOW)).toBe('No longer valid');
  });

  it('reports an aged-out issued pass as expired', () => {
    expect(describePassExpiry('issued', inDays(-1), NOW)).toBe('Expired');
  });

  it('uses relative wording inside a week and a date beyond it', () => {
    expect(describePassExpiry('issued', new Date(NOW.getTime() + 3600_000).toISOString(), NOW))
      .toBe('Expires today');
    expect(describePassExpiry('issued', inDays(1), NOW)).toBe('Expires tomorrow');
    expect(describePassExpiry('issued', inDays(5), NOW)).toBe('Expires in 5 days');
    expect(describePassExpiry('issued', inDays(29), NOW)).toMatch(/^Expires \S/);
    expect(describePassExpiry('issued', inDays(29), NOW)).not.toMatch(/in \d+ days/);
  });
});

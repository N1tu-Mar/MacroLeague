import { checkAge, parseBirthDate, ageOn, MIN_AGE_YEARS } from '../ageGate';

// A fixed "now" so birthday-boundary behavior is deterministic instead of
// depending on when the suite happens to run.
const NOW = new Date(2026, 6, 20); // 2026-07-20 (month is 0-indexed)

describe('parseBirthDate', () => {
  it('parses a valid date', () => {
    expect(parseBirthDate('7', '20', '2000')).toEqual({ year: 2000, month: 7, day: 20 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseBirthDate(' 7 ', ' 20 ', ' 2000 ')).toEqual({
      year: 2000,
      month: 7,
      day: 20,
    });
  });

  it('rejects an empty part', () => {
    expect(parseBirthDate('', '20', '2000')).toBeNull();
    expect(parseBirthDate('7', '', '2000')).toBeNull();
    expect(parseBirthDate('7', '20', '')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseBirthDate('July', '20', '2000')).toBeNull();
    expect(parseBirthDate('7', 'twenty', '2000')).toBeNull();
  });

  it('rejects out-of-range months and days', () => {
    expect(parseBirthDate('13', '1', '2000')).toBeNull();
    expect(parseBirthDate('0', '1', '2000')).toBeNull();
    expect(parseBirthDate('1', '32', '2000')).toBeNull();
    expect(parseBirthDate('1', '0', '2000')).toBeNull();
  });

  it('rejects dates that do not exist on the calendar', () => {
    expect(parseBirthDate('2', '30', '2001')).toBeNull();
    expect(parseBirthDate('4', '31', '2000')).toBeNull();
    // 1900 was NOT a leap year (divisible by 100, not by 400).
    expect(parseBirthDate('2', '29', '1900')).toBeNull();
  });

  it('accepts Feb 29 in a real leap year', () => {
    expect(parseBirthDate('2', '29', '2000')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parseBirthDate('2', '29', '2004')).toEqual({ year: 2004, month: 2, day: 29 });
  });

  it('rejects an implausibly old year (likely a typo)', () => {
    expect(parseBirthDate('1', '1', '1089')).toBeNull();
  });
});

describe('ageOn', () => {
  it('counts whole years elapsed', () => {
    expect(ageOn({ year: 2000, month: 7, day: 20 }, NOW)).toBe(26);
  });

  it('turns over exactly ON the birthday, not before or after', () => {
    // The day before their 13th birthday.
    expect(ageOn({ year: 2013, month: 7, day: 21 }, NOW)).toBe(12);
    // The birthday itself.
    expect(ageOn({ year: 2013, month: 7, day: 20 }, NOW)).toBe(13);
    // The day after.
    expect(ageOn({ year: 2013, month: 7, day: 19 }, NOW)).toBe(13);
  });

  it('handles a birthday later in the year', () => {
    expect(ageOn({ year: 2000, month: 12, day: 31 }, NOW)).toBe(25);
  });
});

describe('checkAge', () => {
  it('accepts someone comfortably over the minimum', () => {
    const result = checkAge('7', '20', '2000', NOW);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.age).toBe(26);
      expect(result.birthYear).toBe(2000);
    }
  });

  it('accepts someone exactly on their 13th birthday', () => {
    expect(checkAge('7', '20', '2013', NOW).status).toBe('ok');
  });

  it('REJECTS someone one day short of 13', () => {
    // The boundary that actually matters — an off-by-one here is the whole bug.
    const result = checkAge('7', '21', '2013', NOW);
    expect(result.status).toBe('underage');
  });

  it('rejects an obviously underage date', () => {
    expect(checkAge('1', '1', '2020', NOW).status).toBe('underage');
  });

  it('never reveals the age threshold in its message', () => {
    const result = checkAge('1', '1', '2020', NOW);
    if (result.status === 'underage') {
      expect(result.message).not.toContain(String(MIN_AGE_YEARS));
      expect(result.message.toLowerCase()).not.toContain('13');
      expect(result.message.toLowerCase()).not.toContain('old enough');
    }
  });

  it('reports incomplete input as incomplete, not invalid', () => {
    // A half-typed form must not flash a red error at the user.
    expect(checkAge('', '', '', NOW).status).toBe('incomplete');
    expect(checkAge('7', '', '', NOW).status).toBe('incomplete');
    expect(checkAge('7', '20', '', NOW).status).toBe('incomplete');
  });

  it('rejects a malformed date as invalid', () => {
    expect(checkAge('2', '30', '2000', NOW).status).toBe('invalid');
    expect(checkAge('13', '1', '2000', NOW).status).toBe('invalid');
  });

  it('rejects a future birth date', () => {
    expect(checkAge('1', '1', '2030', NOW).status).toBe('invalid');
  });

  it('rejects an implausibly high age', () => {
    expect(checkAge('1', '1', '1901', NOW).status).toBe('invalid');
  });
});

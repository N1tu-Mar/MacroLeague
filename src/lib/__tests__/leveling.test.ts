import { getXpForLevel, LEVEL_TITLES } from '../leveling';

describe('getXpForLevel', () => {
  it('scales at 500 XP per level', () => {
    expect(getXpForLevel(1)).toBe(500);
    expect(getXpForLevel(2)).toBe(1000);
    expect(getXpForLevel(10)).toBe(5000);
  });

  it('has a title for each of levels 1–10', () => {
    for (let level = 1; level <= 10; level++) {
      expect(typeof LEVEL_TITLES[level]).toBe('string');
      expect(LEVEL_TITLES[level].length).toBeGreaterThan(0);
    }
  });
});

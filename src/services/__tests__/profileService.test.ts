jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import { levelFromXp, slugifyUsername } from '../profileService';
import { getXpForLevel } from '../../lib/leveling';

describe('levelFromXp', () => {
  it('starts everyone at level 1', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(1)).toBe(1);
    expect(levelFromXp(499)).toBe(1);
  });

  it('advances a level every 500 XP', () => {
    expect(levelFromXp(500)).toBe(2);
    expect(levelFromXp(999)).toBe(2);
    expect(levelFromXp(1000)).toBe(3);
    expect(levelFromXp(4500)).toBe(10);
  });

  it('clamps negative XP to level 1 rather than going below it', () => {
    expect(levelFromXp(-1)).toBe(1);
    expect(levelFromXp(-10_000)).toBe(1);
  });

  /**
   * `profileService.XP_PER_LEVEL` and `lib/leveling.getXpForLevel` are separate
   * constants that both encode 500 XP/level, and both files carry a comment
   * warning they must agree. Nothing enforced it until now — if they drift, the
   * level on Home disagrees with the XP bar on Profile.
   */
  it('agrees with getXpForLevel at every boundary', () => {
    for (let level = 1; level <= 20; level += 1) {
      const xpToCompleteLevel = getXpForLevel(level);

      // One XP short of the threshold is still the current level...
      expect(levelFromXp(xpToCompleteLevel - 1)).toBe(level);
      // ...and hitting it exactly rolls over to the next.
      expect(levelFromXp(xpToCompleteLevel)).toBe(level + 1);
    }
  });
});

describe('slugifyUsername', () => {
  it('lowercases and keeps valid characters', () => {
    expect(slugifyUsername('AlexChen')).toBe('alexchen');
    expect(slugifyUsername('alex_chen99')).toBe('alex_chen99');
  });

  it('replaces runs of invalid characters with a single underscore', () => {
    expect(slugifyUsername('Alex Chen')).toBe('alex_chen');
    expect(slugifyUsername('Alex   Chen')).toBe('alex_chen');
    expect(slugifyUsername('alex.chen-99')).toBe('alex_chen_99');
  });

  it('strips leading and trailing underscores', () => {
    expect(slugifyUsername('  Alex Chen  ')).toBe('alex_chen');
    expect(slugifyUsername('!!!alex!!!')).toBe('alex');
  });

  it('pads short names to the 3-character minimum', () => {
    expect(slugifyUsername('Al')).toBe('al0');
    expect(slugifyUsername('A')).toBe('a00');
  });

  it('truncates to the 30-character maximum', () => {
    const result = slugifyUsername('a'.repeat(50));
    expect(result).toHaveLength(30);
  });

  /**
   * The DB enforces the handle format independently (migration 0021). Any output
   * that fails this pattern is an insert that will be rejected at runtime.
   */
  it('always produces a slug the DB handle constraint accepts', () => {
    const inputs = [
      'Alex Chen',
      'A',
      '!!!',
      '  ',
      '____',
      'ålex çhen',
      '🏋️ Gym Rat 🏋️',
      'a'.repeat(50),
      'Name-With.Lots__Of***Junk',
      '123',
    ];

    for (const input of inputs) {
      const slug = slugifyUsername(input);
      expect(slug.length).toBeGreaterThanOrEqual(3);
      expect(slug.length).toBeLessThanOrEqual(30);
      expect(slug).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('degrades an all-invalid name to a padded placeholder rather than an empty slug', () => {
    // An empty username would violate the DB constraint outright.
    expect(slugifyUsername('!!!').length).toBeGreaterThanOrEqual(3);
    expect(slugifyUsername('🏋️').length).toBeGreaterThanOrEqual(3);
  });
});

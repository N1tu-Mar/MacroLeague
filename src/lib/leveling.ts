// Leveling config. The XP-per-level math lives alongside profileService.levelFromXp
// (both use 500 XP/level) so Home, Profile, and the XP bar always agree. Moved out
// of the former mock data file; these are app constants, not user data.

export const LEVEL_TITLES: Record<number, string> = {
  1: 'Rookie',
  2: 'Starter',
  3: 'Consistent',
  4: 'Dedicated',
  5: 'Competitor',
  6: 'Contender',
  7: 'Macro Athlete',
  8: 'Elite',
  9: 'Champion',
  10: 'Legend',
};

/** Total XP required to complete the given level (level 1 => 500, level 2 => 1000…). */
export function getXpForLevel(level: number): number {
  return level * 500;
}

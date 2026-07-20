jest.mock('../../lib/supabase', () => ({ supabase: {} }));

import { publicLeaderboardName } from '../leaderboardService';

/**
 * This is a privacy control, not a formatting nicety: `user_<hex>` usernames are
 * derived from the account UUID. Rendering one publicly leaks an internal
 * identifier, so the fallback must hold for every generated-handle shape.
 */
describe('publicLeaderboardName', () => {
  it('prefers the display name', () => {
    expect(publicLeaderboardName({ displayName: 'Alex Chen', username: 'alexc' })).toBe(
      'Alex Chen',
    );
  });

  it('falls back to a real username when no display name is set', () => {
    expect(publicLeaderboardName({ displayName: null, username: 'alexc' })).toBe('alexc');
  });

  it('treats a whitespace-only display name as unset', () => {
    expect(publicLeaderboardName({ displayName: '   ', username: 'alexc' })).toBe('alexc');
  });

  it('trims surrounding whitespace', () => {
    expect(publicLeaderboardName({ displayName: '  Alex Chen  ', username: null })).toBe(
      'Alex Chen',
    );
  });

  it('NEVER exposes a generated user_<hex> placeholder', () => {
    const generated = [
      'user_a1b2c3',
      'user_deadbeef',
      'user_0123456789abcdef',
      'USER_A1B2C3', // the regex is case-insensitive
      'User_AbCdEf',
    ];

    for (const username of generated) {
      const rendered = publicLeaderboardName({ displayName: null, username });
      expect(rendered).toBe('Athlete');
      expect(rendered).not.toContain('user_');
    }
  });

  it('still prefers a display name over a generated username', () => {
    expect(publicLeaderboardName({ displayName: 'Alex', username: 'user_a1b2c3' })).toBe('Alex');
  });

  it('does not over-match legitimate usernames that merely start with "user"', () => {
    // `usernaut` and `user_bob` are real chosen handles — only hex tails are generated.
    expect(publicLeaderboardName({ displayName: null, username: 'usernaut' })).toBe('usernaut');
    expect(publicLeaderboardName({ displayName: null, username: 'user_bob' })).toBe('user_bob');
    expect(publicLeaderboardName({ displayName: null, username: 'user_123xyz' })).toBe(
      'user_123xyz',
    );
  });

  it('falls back to the generic label when nothing is usable', () => {
    expect(publicLeaderboardName({ displayName: null, username: null })).toBe('Athlete');
    expect(publicLeaderboardName({ displayName: '', username: '' })).toBe('Athlete');
  });
});

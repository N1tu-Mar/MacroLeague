import {
  describeOwnEvent,
  describeFriendEvent,
  minutesSince,
} from '../activityCopy';

const EVENT_TYPES = [
  'meal_logged',
  'meal_count_goal_hit',
  'daily_protein_goal_hit',
  'daily_macro_accuracy_hit',
  'streak_milestone',
  'streak_bonus',
  'challenge_win',
];

describe('describeOwnEvent — second person', () => {
  it('addresses the viewer directly', () => {
    expect(describeOwnEvent({ event_type: 'meal_logged', points_delta: 10 }).text).toBe(
      'Logged a meal · +10 pts',
    );
    expect(
      describeOwnEvent({ event_type: 'daily_protein_goal_hit', points_delta: 25 }).text,
    ).toContain('your protein goal');
  });

  it('includes the streak length from metadata', () => {
    const copy = describeOwnEvent({
      event_type: 'streak_milestone',
      points_delta: 100,
      metadata: { streak: 14 },
    });
    expect(copy.text).toBe('Reached a 14-day streak · +100 pts');
    expect(copy.icon).toBe('streak');
  });

  it('survives missing metadata without printing "undefined"', () => {
    const copy = describeOwnEvent({ event_type: 'streak_milestone', points_delta: 100 });
    expect(copy.text).not.toContain('undefined');
    expect(copy.text).toBe('Reached a -day streak · +100 pts');
  });

  it('shows redemptions, which are the viewer’s own business', () => {
    expect(
      describeOwnEvent({ event_type: 'reward_redemption', points_delta: -500 }).text,
    ).toBe('Redeemed a reward · -500 pts');
  });

  it('falls back for an unknown event type instead of rendering blank', () => {
    const copy = describeOwnEvent({ event_type: 'something_new', points_delta: 5 });
    expect(copy.text).toBe('Earned 5 pts');
    expect(copy.icon).toBe('star');
  });
});

describe('describeFriendEvent — third person', () => {
  it('reads correctly after a name is prefixed', () => {
    // The UI renders "<Name> " + text, so these must start lowercase and must
    // not repeat the name.
    for (const event_type of EVENT_TYPES) {
      const { text } = describeFriendEvent({ event_type, points_delta: 10 });
      expect(text[0]).toBe(text[0].toLowerCase());
    }
  });

  it('uses "their", never "your"', () => {
    for (const event_type of EVENT_TYPES) {
      const { text } = describeFriendEvent({ event_type, points_delta: 10 });
      expect(text).not.toContain('your');
    }
  });

  it('omits the points suffix when nothing was earned', () => {
    // "+0 pts" reads as a bug to whoever sees it.
    const { text } = describeFriendEvent({ event_type: 'meal_logged', points_delta: 0 });
    expect(text).toBe('logged a meal');
    expect(text).not.toContain('pts');
  });

  it('includes the points suffix when something was earned', () => {
    expect(describeFriendEvent({ event_type: 'challenge_win', points_delta: 100 }).text).toBe(
      'won a challenge · +100 pts',
    );
  });

  it('never claims a friend redeemed a reward', () => {
    // Redemptions are excluded at the source (migration 0021). If one ever
    // reached this function it must degrade to the neutral fallback, not
    // broadcast someone's spending.
    const { text } = describeFriendEvent({
      event_type: 'reward_redemption',
      points_delta: -500,
    });
    expect(text.toLowerCase()).not.toContain('redeem');
    expect(text.toLowerCase()).not.toContain('reward');
  });

  it('maps every known event to a distinct, non-empty phrase', () => {
    const phrases = EVENT_TYPES.map(
      (event_type) => describeFriendEvent({ event_type, points_delta: 10 }).text,
    );
    expect(new Set(phrases).size).toBe(EVENT_TYPES.length);
    phrases.forEach((p) => expect(p.length).toBeGreaterThan(0));
  });
});

describe('minutesSince', () => {
  const NOW = Date.parse('2026-07-20T12:00:00.000Z');

  it('counts whole minutes elapsed', () => {
    expect(minutesSince('2026-07-20T11:30:00.000Z', NOW)).toBe(30);
    expect(minutesSince('2026-07-20T11:59:30.000Z', NOW)).toBe(0);
  });

  it('never returns a negative value for a clock-skewed future timestamp', () => {
    // Device clocks drift; a "-3m ago" label would be visibly broken.
    expect(minutesSince('2026-07-20T12:05:00.000Z', NOW)).toBe(0);
  });

  it('returns 0 for an unparseable timestamp rather than NaN', () => {
    expect(minutesSince('not-a-date', NOW)).toBe(0);
  });
});

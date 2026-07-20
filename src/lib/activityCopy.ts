import type { AppIconName } from '../components/ui/AppIcon';

/**
 * Human copy for gamification events, in both grammatical persons.
 *
 * Lives in lib/ (not in a service) for two reasons: it is pure, so it can be
 * unit tested without the Supabase client, and both feeds need it — the viewer's
 * own activity and their friends' activity are rendered from the SAME ledger
 * rows but must not read the same way.
 *
 * Second person ("Logged a meal") and third person ("logged a meal") are kept as
 * separate functions rather than one parameterised formatter. Sharing a single
 * string template forces every phrase to be awkward in one of the two contexts —
 * "Reached a 7-day streak" and "reached a 7-day streak" happen to align, but
 * "Redeemed a reward" / "redeemed a reward" and the possessives ("your protein
 * goal" vs "their protein goal") do not.
 */

export type ActivityIcon = AppIconName | 'streak';

export interface ActivityEventLike {
  event_type: string;
  points_delta: number;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityCopy {
  icon: ActivityIcon;
  text: string;
}

function streakOf(metadata: Record<string, unknown> | null | undefined): string {
  const value = metadata?.streak;
  return typeof value === 'number' || typeof value === 'string' ? String(value) : '';
}

/** Second person — the viewer's own activity. */
export function describeOwnEvent(row: ActivityEventLike): ActivityCopy {
  const m = row.metadata ?? null;
  switch (row.event_type) {
    case 'meal_logged':
      return { icon: 'meal', text: `Logged a meal · +${row.points_delta} pts` };
    case 'meal_count_goal_hit':
      return { icon: 'meal-goal', text: `Hit your meal-count goal · +${row.points_delta} pts` };
    case 'daily_protein_goal_hit':
      return { icon: 'protein', text: `Locked your protein goal · +${row.points_delta} pts` };
    case 'daily_macro_accuracy_hit':
      return { icon: 'target', text: `Nailed your macro accuracy · +${row.points_delta} pts` };
    case 'streak_milestone':
      return { icon: 'streak', text: `Reached a ${streakOf(m)}-day streak · +${row.points_delta} pts` };
    case 'streak_bonus':
      return { icon: 'streak', text: `Streak bonus · +${row.points_delta} pts` };
    case 'challenge_win':
      return { icon: 'trophy', text: `Won a challenge · +${row.points_delta} pts` };
    case 'reward_redemption':
      return { icon: 'gift', text: `Redeemed a reward · ${row.points_delta} pts` };
    default:
      return { icon: 'star', text: `Earned ${row.points_delta} pts` };
  }
}

/**
 * Third person — a friend's activity. The caller renders the actor's name in
 * front, so these phrases start lowercase and carry no leading name.
 *
 * NOTE: 'reward_redemption' has no case here on purpose. Redemptions are a
 * private financial action and are excluded from the friend feed at the source
 * (get_friend_activity_feed, migration 0021), so reaching the default branch for
 * one would itself be the bug.
 */
export function describeFriendEvent(row: ActivityEventLike): ActivityCopy {
  const m = row.metadata ?? null;
  // Only surface a points suffix when something was actually earned — "+0 pts"
  // reads as a bug to the person seeing it.
  const pts = row.points_delta > 0 ? ` · +${row.points_delta} pts` : '';

  switch (row.event_type) {
    case 'meal_logged':
      return { icon: 'meal', text: `logged a meal${pts}` };
    case 'meal_count_goal_hit':
      return { icon: 'meal-goal', text: `hit their meal-count goal${pts}` };
    case 'daily_protein_goal_hit':
      return { icon: 'protein', text: `locked their protein goal${pts}` };
    case 'daily_macro_accuracy_hit':
      return { icon: 'target', text: `nailed their macro accuracy${pts}` };
    case 'streak_milestone':
      return { icon: 'streak', text: `reached a ${streakOf(m)}-day streak${pts}` };
    case 'streak_bonus':
      return { icon: 'streak', text: `earned a streak bonus${pts}` };
    case 'challenge_win':
      return { icon: 'trophy', text: `won a challenge${pts}` };
    default:
      return { icon: 'star', text: `earned ${row.points_delta} pts` };
  }
}

/** Whole minutes between an ISO timestamp and now, floored at zero. */
export function minutesSince(isoTimestamp: string, now: number = Date.now()): number {
  const then = new Date(isoTimestamp).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((now - then) / 60000));
}

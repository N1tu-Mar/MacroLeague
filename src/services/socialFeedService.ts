import { supabase } from '../lib/supabase';
import type { AppIconName } from '../components/ui/AppIcon';
import { describeFriendEvent, minutesSince } from '../lib/activityCopy';
import { EMPTY_SOCIAL_HANDLES, type SocialHandles } from '../lib/socialHandles';

// Re-exported so callers can reach the pure helpers and the network calls from
// one import. The implementations live in lib/socialHandles.ts precisely because
// they must stay free of the Supabase client to remain unit testable.
export {
  EMPTY_SOCIAL_HANDLES,
  HANDLE_RULES,
  PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  isValidHandle,
  normalizeHandle,
  profileUrlFor,
  type SocialHandles,
  type SocialPlatform,
} from '../lib/socialHandles';

/**
 * The REAL friend activity feed.
 *
 * activityService.getRecentActivityFeed() reads the signed-in user's OWN events
 * (RLS restricts to own rows) and is still the right source for "your recent
 * activity". This module is the cross-user counterpart: it reads accepted
 * FRIENDS' events through get_friend_activity_feed() (migration 0021), the only
 * path by which one user may see another's ledger.
 *
 * Nothing here can read a non-friend's data: the RPC re-derives the caller's
 * friend set server-side on every call and honours each user's
 * activity_visibility opt-out. Meal contents, macros and goals are never
 * included — a food diary is not social data.
 */

export type ReactionKind = 'fire' | 'muscle' | 'clap' | 'trophy';

export const REACTION_KINDS: ReactionKind[] = ['fire', 'muscle', 'clap', 'trophy'];

export interface FriendActivityEntry {
  eventId: string;
  actorId: string;
  /** Already-safe public name — never the generated user_<hex> placeholder. */
  actorName: string;
  actorUsername: string;
  actorAvatarUrl: string | null;
  icon: AppIconName | 'streak';
  text: string;
  occurredAt: string;
  minutesAgo: number;
  reactionCount: number;
  /** The viewer's own reaction, if any. */
  viewerReaction: ReactionKind | null;
}

type FeedRow = {
  event_id: string;
  actor_id: string;
  actor_name: string | null;
  actor_username: string | null;
  actor_avatar: string | null;
  event_type: string;
  points_delta: number;
  xp_delta: number;
  occurred_at: string;
  metadata: Record<string, any> | null;
  reaction_count: number;
  viewer_reaction: string | null;
};

function toReactionKind(value: string | null): ReactionKind | null {
  return value && (REACTION_KINDS as string[]).includes(value)
    ? (value as ReactionKind)
    : null;
}

export interface FriendFeedPage {
  entries: FriendActivityEntry[];
  /** Cursor for the next page; null when the end has been reached. */
  nextCursor: { before: string; beforeId: string } | null;
}

/**
 * One page of friends' activity, newest first.
 *
 * Keyset-paginated on (occurred_at, event_id) rather than OFFSET: the feed grows
 * at the head, so an offset would both drift as new events land and degrade
 * linearly as users scroll.
 */
export async function getFriendActivityFeed(
  limit = 20,
  cursor?: { before: string; beforeId: string } | null,
): Promise<FriendFeedPage> {
  const { data, error } = await supabase.rpc('get_friend_activity_feed', {
    p_limit: limit,
    p_before: cursor?.before ?? null,
    p_before_id: cursor?.beforeId ?? null,
  });

  if (error) throw error;

  const rows = (data ?? []) as FeedRow[];
  const now = Date.now();

  const entries = rows.map((row) => {
    const { icon, text } = describeFriendEvent(row);
    return {
      eventId: row.event_id,
      actorId: row.actor_id,
      actorName: row.actor_name?.trim() || 'MacroLeague athlete',
      actorUsername: row.actor_username ?? '',
      actorAvatarUrl: row.actor_avatar,
      icon,
      text,
      occurredAt: row.occurred_at,
      minutesAgo: minutesSince(row.occurred_at, now),
      reactionCount: Number(row.reaction_count) || 0,
      viewerReaction: toReactionKind(row.viewer_reaction),
    };
  });

  const last = rows[rows.length - 1];
  return {
    entries,
    // A short page means there is nothing left to fetch.
    nextCursor:
      last && rows.length >= limit
        ? { before: last.occurred_at, beforeId: last.event_id }
        : null,
  };
}

export interface ReactionResult {
  reactionCount: number;
  viewerReaction: ReactionKind | null;
}

/**
 * Toggle a reaction on a friend's event.
 *
 * Sending the reaction the viewer already gave removes it; sending a different
 * one switches it. The server authorizes friendship on every call, so a guessed
 * event id is useless.
 */
export async function reactToActivity(
  eventId: string,
  kind: ReactionKind = 'fire',
): Promise<ReactionResult> {
  const { data, error } = await supabase.rpc('react_to_activity', {
    p_event_id: eventId,
    p_kind: kind,
  });

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | { r_reaction_count: number; r_viewer_reaction: string | null }
    | undefined;

  return {
    reactionCount: Number(row?.r_reaction_count) || 0,
    viewerReaction: toReactionKind(row?.r_viewer_reaction ?? null),
  };
}

// ---------------------------------------------------------------------------
// Linked social handles
// ---------------------------------------------------------------------------

/**
 * A friend's linked handles.
 *
 * Returns empty handles for every denied case — not a friend, the owner set
 * their links private, the account is deactivated, or the id does not exist.
 * These are indistinguishable by design, so this cannot probe for accounts.
 */
export async function getFriendSocialLinks(userId: string): Promise<SocialHandles> {
  const { data, error } = await supabase.rpc('get_friend_social_links', {
    p_user_id: userId,
  });

  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | { instagram_handle: string | null; snapchat_handle: string | null; tiktok_handle: string | null }
    | undefined;

  if (!row) return { ...EMPTY_SOCIAL_HANDLES };

  return {
    instagram: row.instagram_handle,
    snapchat: row.snapchat_handle,
    tiktok: row.tiktok_handle,
  };
}

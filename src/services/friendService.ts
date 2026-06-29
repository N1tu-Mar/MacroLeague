import { supabase } from '../lib/supabase';
import { publicLeaderboardName } from './leaderboardService';

/**
 * Friendships (request/accept) + challenge invites, migration 0011. profiles RLS
 * is own-row only, so all of these go through SECURITY DEFINER RPCs that expose
 * only display fields — the client never reads another user's profile row directly.
 */

export type FriendshipStatus = 'none' | 'outgoing' | 'incoming' | 'friends';

export interface UserSearchResult {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  university: string | null;
  /** Display name to render (never the user_<hex> placeholder). */
  name: string;
  status: FriendshipStatus;
}

export interface Friend {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  university: string | null;
  name: string;
}

export interface FriendRequest extends Friend {
  requestedAt: string;
}

export interface FriendStanding extends Friend {
  score: number;
  streakCount: number;
  rank: number;
}

/** Search other users by username / display name. Requires >= 2 chars. */
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc('search_users', { p_query: q });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    university: r.university,
    name: publicLeaderboardName(r as any),
    status: r.friendship_status as FriendshipStatus,
  }));
}

/** Send (or reciprocally accept) a friend request. Returns the new status. */
export async function sendFriendRequest(addresseeId: string): Promise<FriendshipStatus> {
  const { data, error } = await supabase.rpc('send_friend_request', { p_addressee: addresseeId });
  if (error) throw error;
  return data as FriendshipStatus;
}

/** Accept or decline an incoming request from `requesterId`. */
export async function respondFriendRequest(requesterId: string, accept: boolean): Promise<FriendshipStatus> {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_requester: requesterId,
    p_accept: accept,
  });
  if (error) throw error;
  return data as FriendshipStatus;
}

/** Remove an existing friendship (either direction). */
export async function removeFriend(otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_friend', { p_other: otherUserId });
  if (error) throw error;
}

export async function getFriends(): Promise<Friend[]> {
  const { data, error } = await supabase.rpc('get_friends');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    university: r.university,
    name: publicLeaderboardName(r as any),
  }));
}

export async function getFriendRequests(): Promise<FriendRequest[]> {
  const { data, error } = await supabase.rpc('get_friend_requests');
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    university: r.university,
    name: publicLeaderboardName(r as any),
    requestedAt: r.requested_at,
  }));
}

/** Friends-only leaderboard. Includes the caller and shows zero scores. */
export async function getFriendsLeaderboard(windowDays = 14): Promise<FriendStanding[]> {
  const { data, error } = await supabase.rpc('get_friends_leaderboard', { p_window_days: windowDays });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r, i) => ({
    userId: r.user_id,
    username: r.username,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    university: r.university,
    name: publicLeaderboardName(r as any),
    score: Number(r.score),
    streakCount: r.streak_count ?? 0,
    rank: i + 1,
  }));
}

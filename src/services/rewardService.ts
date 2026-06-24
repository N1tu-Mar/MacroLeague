import { supabase } from '../lib/supabase';

export interface RewardCatalogItem {
  id: string;
  partnerName: string;
  partnerLogo: string;
  description: string;
  pointsCost: number;
  category: string;
  expiryDate: string | null;
}

type RewardRow = {
  id: string;
  partner_name: string;
  partner_logo: string;
  description: string;
  points_cost: number;
  category: string;
  expiry_date: string | null;
};

/** Loads the active rewards catalog (public-read table), cheapest first. */
export async function listRewards(): Promise<RewardCatalogItem[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('id, partner_name, partner_logo, description, points_cost, category, expiry_date')
    .eq('active', true)
    .order('points_cost', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as RewardRow[]).map((row) => ({
    id: row.id,
    partnerName: row.partner_name,
    partnerLogo: row.partner_logo,
    description: row.description,
    pointsCost: row.points_cost,
    category: row.category,
    expiryDate: row.expiry_date,
  }));
}

/**
 * Reward ids the signed-in user has already redeemed (RLS restricts to own rows),
 * so the UI can mark them as claimed. Returns a Set for O(1) membership checks.
 */
export async function getRedeemedRewardIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('user_rewards').select('reward_id');
  if (error) throw error;
  return new Set(((data ?? []) as { reward_id: string }[]).map((row) => row.reward_id));
}

export interface RedeemResult {
  newBalance: number;
  userRewardId: string;
}

/**
 * Redeems a reward through the ledger-backed redeem_reward() RPC (migration 0006):
 * one atomic transaction appends a negative points event, decrements the cached
 * balance, and records the user_reward. The authoritative new balance is returned;
 * callers should sync it into the store (and a refreshStats() stays consistent).
 * Throws a clear message on insufficient points / already-redeemed / expired.
 */
export async function redeemReward(rewardId: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId });
  if (error) throw error;

  // The RPC RETURNS TABLE, so PostgREST yields an array with a single row.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { new_balance: number; user_reward_id: string }
    | undefined;
  if (!row) {
    throw new Error('Redemption did not return a result. Please try again.');
  }
  return { newBalance: row.new_balance, userRewardId: row.user_reward_id };
}

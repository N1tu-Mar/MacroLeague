import { supabase } from '../lib/supabase';
import { RewardPassStatus } from '../lib/rewardPass';

export interface RewardCatalogItem {
  id: string;
  partnerName: string;
  description: string;
  pointsCost: number;
  category: string;
  expiryDate: string | null;
}

type RewardRow = {
  id: string;
  partner_name: string;
  description: string;
  points_cost: number;
  category: string;
  expiry_date: string | null;
};

/** Loads the active rewards catalog (public-read table), cheapest first. */
export async function listRewards(): Promise<RewardCatalogItem[]> {
  const { data, error } = await supabase
    .from('rewards')
    .select('id, partner_name, description, points_cost, category, expiry_date')
    .eq('active', true)
    .order('points_cost', { ascending: true });

  if (error) throw error;

  return ((data ?? []) as RewardRow[]).map((row) => ({
    id: row.id,
    partnerName: row.partner_name,
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
  // Explicit bound: PostgREST silently truncates unbounded reads at max_rows
  // (the exact failure listChallenges was hardened against). No user plausibly
  // holds 1000 distinct rewards, so the cap is a guard, not a pagination need.
  const { data, error } = await supabase
    .from('user_rewards')
    .select('reward_id')
    .limit(1000);
  if (error) throw error;
  return new Set(((data ?? []) as { reward_id: string }[]).map((row) => row.reward_id));
}

export interface RedeemResult {
  newBalance: number;
  userRewardId: string;
  /** The server-issued bearer code for the pass. Never derived on the client. */
  code: string;
  expiresAt: string;
  status: RewardPassStatus;
  /**
   * True when this call replayed an EXISTING redemption instead of spending.
   * Migration 0022 made redeem_reward() idempotent, so the UI must not apply a
   * balance delta or fire a "redeemed" analytics event on a replay.
   */
  alreadyRedeemed: boolean;
}

/**
 * Redeems a reward through the ledger-backed redeem_reward() RPC (migrations
 * 0006 + 0022): one atomic transaction appends a negative points event,
 * decrements the cached balance, records the user_reward, AND issues the
 * unguessable server-generated pass code. The authoritative new balance is
 * returned; callers should sync it into the store (and a refreshStats() stays
 * consistent). Throws a clear message on insufficient points / expired.
 *
 * A repeat call is NOT an error since 0022: it returns the existing pass with
 * alreadyRedeemed = true and spends nothing, so a dismissed pass sheet or a
 * reinstalled app can always recover the code the member already paid for.
 */
export async function redeemReward(rewardId: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_reward', { p_reward_id: rewardId });
  if (error) throw error;

  // The RPC RETURNS TABLE, so PostgREST yields an array with a single row.
  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        new_balance: number;
        user_reward_id: string;
        code: string;
        expires_at: string;
        status: RewardPassStatus;
        already_redeemed: boolean;
      }
    | undefined;
  if (!row) {
    throw new Error('Redemption did not return a result. Please try again.');
  }
  return {
    newBalance: row.new_balance,
    userRewardId: row.user_reward_id,
    code: row.code,
    expiresAt: row.expires_at,
    status: row.status,
    alreadyRedeemed: row.already_redeemed,
  };
}

export interface RewardPass {
  id: string;
  rewardId: string;
  partnerName: string;
  description: string;
  code: string;
  status: RewardPassStatus;
  issuedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  pointsSpent: number;
}

type RewardPassRow = {
  id: string;
  reward_id: string;
  code: string;
  status: RewardPassStatus;
  issued_at: string;
  expires_at: string;
  redeemed_at: string | null;
  points_spent: number;
  // PostgREST embeds the FK-related row; it is an object for a to-one relation,
  // but the generated types are loose enough that an array can appear, so both
  // shapes are normalized below.
  rewards: { partner_name: string; description: string } | { partner_name: string; description: string }[] | null;
};

/**
 * The signed-in member's redemption passes, newest first. Reads the table
 * directly rather than through an RPC: reward_redemptions has an owner-only
 * select policy (migration 0022), so RLS already scopes this to own rows, and
 * the rewards catalog is public-read so the embed needs no elevated access.
 */
export async function listRewardPasses(): Promise<RewardPass[]> {
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select(
      'id, reward_id, code, status, issued_at, expires_at, redeemed_at, points_spent, rewards(partner_name, description)',
    )
    .order('issued_at', { ascending: false })
    // Bounded for the same reason as getRedeemedRewardIds: never rely on
    // PostgREST's silent max_rows truncation as an implicit limit.
    .limit(500);

  if (error) throw error;

  return ((data ?? []) as RewardPassRow[]).map((row) => {
    const reward = Array.isArray(row.rewards) ? row.rewards[0] : row.rewards;
    return {
      id: row.id,
      rewardId: row.reward_id,
      partnerName: reward?.partner_name ?? 'Reward',
      description: reward?.description ?? '',
      code: row.code,
      status: row.status,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at,
      redeemedAt: row.redeemed_at,
      pointsSpent: row.points_spent,
    };
  });
}

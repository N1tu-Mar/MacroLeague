import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Type, Spacing, Radius, useTheme } from '../../theme';
import { useUserStore } from '../../store/userStore';
import {
  listRewards,
  getRedeemedRewardIds,
  redeemReward,
  listRewardPasses,
  RewardCatalogItem,
  RewardPass,
} from '../../services/rewardService';
import { getEarnRules, EarnRule } from '../../services/ruleSetService';
import { analytics } from '../../lib/analytics';
import {
  formatRewardCode,
  describePassExpiry,
  isPassActive,
  RewardPassStatus,
} from '../../lib/rewardPass';
import {
  Screen,
  ScreenHeader,
  Text,
  Card,
  Button,
  ProgressBar,
  Badge,
  Sheet,
  AppIcon,
  AppIconName,
  Divider,
  QRCode,
} from '../../components/ui';
import { toUserFacingMessage } from '../../lib/errors';

function rewardIcon(reward: RewardCatalogItem): AppIconName {
  if (reward.category === 'Fitness') return 'protein';
  if (reward.category === 'Drinks') {
    return reward.partnerName.toLowerCase().includes('café') ? 'coffee' : 'drink';
  }
  if (reward.partnerName.toLowerCase().includes('bowl')) return 'bowl';
  if (reward.partnerName.toLowerCase().includes('meal')) return 'meal-plan';
  return 'gift';
}

/**
 * What the pass sheet is currently showing. The code and expiry are SERVER
 * values from redeem_reward() — the screen no longer derives anything about
 * the pass locally, because a locally-derived code is identical for every
 * member and cannot be honoured by a partner.
 */
interface ActivePass {
  reward: RewardCatalogItem;
  code: string;
  expiresAt: string;
  status: RewardPassStatus;
}

export default function RewardsScreen({ navigation }: any) {
  const { colors } = useTheme();

  const user = useUserStore((s) => s.user);
  const adjustPointsLocally = useUserStore((s) => s.adjustPointsLocally);
  const refreshStats = useUserStore((s) => s.refreshStats);

  const [rewards, setRewards] = useState<RewardCatalogItem[]>([]);
  const [earnRules, setEarnRules] = useState<EarnRule[]>([]);
  const [redeemed, setRedeemed] = useState<Set<string>>(new Set());
  const [selectedReward, setSelectedReward] = useState<RewardCatalogItem | null>(null);
  const [activePass, setActivePass] = useState<ActivePass | null>(null);
  // Passes the member already holds, keyed by reward id, so tapping an
  // already-redeemed card re-opens the real code instead of dead-ending.
  const [passes, setPasses] = useState<Map<string, RewardPass>>(new Map());
  const [showConfetti, setShowConfetti] = useState(false);
  const [earnExpanded, setEarnExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);

  const balance = user?.points ?? 0;

  // On focus: pull the real points balance + the catalog + which rewards this
  // user has already redeemed, so the screen reflects backend truth.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refreshStats();
      const userId = user?.id;
      (async () => {
        try {
          const [catalog, redeemedIds, rules, ownedPasses] = await Promise.all([
            listRewards(),
            getRedeemedRewardIds(),
            userId ? getEarnRules(userId) : Promise.resolve([] as EarnRule[]),
            listRewardPasses(),
          ]);
          if (active) {
            setRewards(catalog);
            setRedeemed(redeemedIds);
            setEarnRules(rules);
            // Newest first from the service, so the first pass seen for a
            // reward is the current one — later duplicates are superseded.
            const byReward = new Map<string, RewardPass>();
            for (const pass of ownedPasses) {
              if (!byReward.has(pass.rewardId)) byReward.set(pass.rewardId, pass);
            }
            setPasses(byReward);
            analytics.rewardsViewed({
              balance: user?.points ?? 0,
              rewardCount: catalog.length,
            });
          }
        } catch {
          // Leave whatever is already shown; the balance card still works.
        } finally {
          if (active) setIsLoading(false);
        }
      })();
      return () => {
        active = false;
      };
    }, [refreshStats, user?.id]),
  );

  function showPass(pass: ActivePass) {
    setActivePass(pass);
    // Keep the cached map in step so re-opening the card later (before the
    // next focus refetch) still shows the code without another round trip.
    setPasses((prev) => {
      const next = new Map(prev);
      const existing = next.get(pass.reward.id);
      next.set(pass.reward.id, {
        id: existing?.id ?? pass.code,
        rewardId: pass.reward.id,
        partnerName: pass.reward.partnerName,
        description: pass.reward.description,
        code: pass.code,
        status: pass.status,
        issuedAt: existing?.issuedAt ?? new Date().toISOString(),
        expiresAt: pass.expiresAt,
        redeemedAt: existing?.redeemedAt ?? null,
        pointsSpent: existing?.pointsSpent ?? pass.reward.pointsCost,
      });
      return next;
    });
  }

  /**
   * Re-opens the pass for an already-redeemed reward. If the pass is cached
   * from the focus fetch it opens instantly; otherwise redeemReward() is
   * called, which since migration 0022 is idempotent — it returns the existing
   * pass and spends nothing, and also backfills a code for redemptions made
   * before passes existed.
   */
  async function handleOpenExistingPass(reward: RewardCatalogItem) {
    const cached = passes.get(reward.id);
    if (cached) {
      showPass({
        reward,
        code: cached.code,
        expiresAt: cached.expiresAt,
        status: cached.status,
      });
      return;
    }
    await handleRedeem(reward);
  }

  async function handleRedeem(reward: RewardCatalogItem) {
    if (!user || isRedeeming) return;
    setIsRedeeming(true);
    try {
      // Ledger-backed, atomic spend on the backend, which also issues the pass
      // code in the same transaction. The authoritative new balance comes back
      // from the RPC; sync the cached store to it, then refresh.
      const result = await redeemReward(reward.id);
      const { newBalance, code, expiresAt, status, alreadyRedeemed } = result;

      // A replay spends nothing, so it must not be counted as a redemption or
      // celebrated — it is just the member re-opening a pass they already own.
      if (!alreadyRedeemed) {
        analytics.rewardRedeemed({
          rewardId: reward.id,
          partnerName: reward.partnerName,
          pointsCost: reward.pointsCost,
        });
        adjustPointsLocally(newBalance - user.points);
        void refreshStats();
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2500);
      }

      setRedeemed((prev) => new Set(prev).add(reward.id));
      showPass({ reward, code, expiresAt, status });
    } catch (caughtError) {
      Alert.alert(
        'Could not redeem',
        toUserFacingMessage(caughtError, 'Please try again.'),
      );
    } finally {
      setIsRedeeming(false);
    }
  }

  const balanceAfter = selectedReward ? balance - selectedReward.pointsCost : 0;
  const canAffordSelected = selectedReward ? balance >= selectedReward.pointsCost : false;
  // Folds the status column and the expires_at timestamp together, the same
  // way validate_reward_code() does server-side, so the sheet cannot present
  // a spent or aged-out pass as scannable.
  const passIsActive = activePass
    ? isPassActive(activePass.status, activePass.expiresAt)
    : false;

  return (
    <Screen scroll>
      <ScreenHeader title="Rewards" onBack={() => navigation.goBack()} />

      {/* Balance card — real backend-owned points. Gold accents allowed here. */}
      <Card variant="hero" style={[styles.balanceCard, { backgroundColor: colors.card }]}>
        <View style={{ flex: 1 }}>
          <Text variant="overline" color={colors.textSecondary}>
            Balance
          </Text>
          <View style={styles.balanceValueRow}>
            <Text style={[Type.scoreMed, { fontSize: 44, lineHeight: 46, color: colors.ink }]}>
              {balance.toLocaleString()}
            </Text>
            <Text variant="subhead" color={colors.gold} style={{ marginBottom: 4 }}>
              LP
            </Text>
          </View>
          <Text variant="labelSm" color={colors.textTertiary} style={{ marginTop: 2 }}>
            Earn LP from logging, streaks & challenges
          </Text>
        </View>
        <View style={[styles.giftBadge, { backgroundColor: colors.goldTint }]}>
          <AppIcon name="gift" size={26} color={colors.gold} />
        </View>
      </Card>

      {showConfetti && (
        <View style={[styles.confetti, { backgroundColor: colors.goldTint }]}>
          <AppIcon name="party" size={20} color={colors.gold} />
          <Text variant="subhead" color={colors.goldText}>
            Reward redeemed
          </Text>
        </View>
      )}

      {/* Available rewards */}
      <Text variant="overline" color={colors.textSecondary} style={styles.sectionLabel}>
        Available rewards
      </Text>
      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.scarlet} />
        </View>
      ) : rewards.length === 0 ? (
        <Text variant="label" color={colors.textSecondary}>
          No rewards available right now. Check back soon.
        </Text>
      ) : (
        <View style={styles.grid}>
          {rewards.map((reward) => {
            const isRedeemed = redeemed.has(reward.id);
            const canAfford = balance >= reward.pointsCost;
            return (
              <Card
                key={reward.id}
                onPress={
                  isRedeemed
                    ? // Already paid for: re-open the real pass rather than
                      // being inert, so the code is never stranded.
                      () => void handleOpenExistingPass(reward)
                    : () => {
                        analytics.rewardDetailViewed({
                          rewardId: reward.id,
                          partnerName: reward.partnerName,
                          pointsCost: reward.pointsCost,
                        });
                        setSelectedReward(reward);
                      }
                }
                style={[styles.rewardCard, isRedeemed && { opacity: 0.6 }]}
              >
                <View style={[styles.rewardIcon, { backgroundColor: colors.goldTint }]}>
                  <AppIcon name={rewardIcon(reward)} size={26} color={colors.gold} />
                </View>
                <Text variant="cardTitle" color={colors.ink} center>
                  {reward.partnerName}
                </Text>
                <Text variant="labelSm" color={colors.textSecondary} center numberOfLines={2} style={{ marginTop: 2 }}>
                  {reward.description}
                </Text>
                <View style={styles.rewardFooter}>
                  {isRedeemed ? (
                    <View style={styles.redeemedRow}>
                      <AppIcon name="check" size={14} color={colors.success} />
                      <Text variant="labelSm" color={colors.successDeep}>
                        View pass
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.costPill, { backgroundColor: colors.track, opacity: canAfford ? 1 : 0.5 }]}>
                      <Text style={[Type.numInline, { color: colors.ink }]}>{reward.pointsCost}</Text>
                      <Text variant="labelSm" color={colors.textSecondary}>
                        LP
                      </Text>
                    </View>
                  )}
                </View>
                {reward.expiryDate && (
                  <Text variant="labelSm" color={colors.textTertiary} center style={{ marginTop: 6 }}>
                    {/* expiry_date is a date-only DB value. Adding local midnight
                        prevents YYYY-MM-DD from parsing as UTC and displaying the
                        previous day in western time zones. */}
                    Expires {new Date(`${reward.expiryDate}T00:00:00`).toLocaleDateString()}
                  </Text>
                )}
              </Card>
            );
          })}
        </View>
      )}

      {/* How to earn */}
      <Pressable
        onPress={() => setEarnExpanded((v) => !v)}
        style={({ pressed }) => [styles.earnHeader, pressed && { opacity: 0.6 }]}
      >
        <Text variant="overline" color={colors.textSecondary}>
          How to earn
        </Text>
        <AppIcon name={earnExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
      </Pressable>
      {earnExpanded && (
        <Card padded={false} style={{ marginTop: Spacing.sm }}>
          {earnRules.length === 0 ? (
            <Text variant="label" color={colors.textSecondary} style={{ padding: Spacing.base }}>
              Scoring rules unavailable right now.
            </Text>
          ) : (
            earnRules.map((rule, i) => (
              <View key={i}>
                {i > 0 && <Divider inset={Spacing.base} />}
                <View style={styles.earnRow}>
                  <Text variant="subhead" color={colors.ink} style={{ flex: 1 }}>
                    {rule.action}
                  </Text>
                  <Text style={[Type.numInline, { color: colors.success }]}>+{rule.points} LP</Text>
                </View>
              </View>
            ))
          )}
        </Card>
      )}

      {/* Reward detail — confirm sheet (spec 22b) */}
      <Sheet
        visible={!!selectedReward}
        onClose={() => setSelectedReward(null)}
        title={selectedReward?.partnerName}
      >
        {selectedReward && (
          <View style={styles.sheetBody}>
            <View style={styles.sheetHeaderRow}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.goldTint }]}>
                <AppIcon name={rewardIcon(selectedReward)} size={28} color={colors.gold} />
              </View>
              <Text variant="body" color={colors.textSecondary} style={{ flex: 1 }}>
                {selectedReward.description}
              </Text>
            </View>

            <Card style={{ marginTop: Spacing.base }}>
              <View style={styles.detailRow}>
                <Text variant="label" color={colors.textSecondary}>
                  Cost
                </Text>
                <Text style={[Type.numInline, { color: colors.ink }]}>{selectedReward.pointsCost} LP</Text>
              </View>
              <Divider style={{ marginVertical: 10 }} />
              <View style={styles.detailRow}>
                <Text variant="label" color={colors.textSecondary}>
                  Balance after
                </Text>
                <Text style={[Type.numInline, { color: canAffordSelected ? colors.ink : colors.error }]}>
                  {balanceAfter} LP
                </Text>
              </View>
              {selectedReward.expiryDate && (
                <>
                  <Divider style={{ marginVertical: 10 }} />
                  <View style={styles.detailRow}>
                    <Text variant="label" color={colors.textSecondary}>
                      Expires
                    </Text>
                    <Text variant="label" color={colors.ink}>
                      {new Date(`${selectedReward.expiryDate}T00:00:00`).toLocaleDateString()}
                    </Text>
                  </View>
                </>
              )}
            </Card>

            <Text variant="labelSm" color={colors.textTertiary} style={{ marginTop: Spacing.md }}>
              One redemption per member. Show the pass at the register; the code is generated after you
              confirm.
            </Text>

            <View style={{ marginTop: Spacing.base, gap: Spacing.sm }}>
              <Button
                label={canAffordSelected ? `Redeem for ${selectedReward.pointsCost} LP` : 'Not enough LP'}
                loading={isRedeeming}
                loadingLabel="Redeeming…"
                disabled={!canAffordSelected}
                onPress={() => {
                  const reward = selectedReward;
                  setSelectedReward(null);
                  void handleRedeem(reward);
                }}
              />
              <Button label="Not now" variant="ghost" onPress={() => setSelectedReward(null)} />
            </View>
          </View>
        )}
      </Sheet>

      {/* Redemption pass (spec 22c) — the code and expiry are SERVER values. */}
      <Sheet visible={!!activePass} onClose={() => setActivePass(null)}>
        {activePass && (
          <View style={styles.sheetBody}>
            <View style={styles.passHeader}>
              <View style={[styles.sheetIcon, { backgroundColor: colors.goldTint }]}>
                <AppIcon name={rewardIcon(activePass.reward)} size={28} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="subhead" color={colors.ink}>
                  {activePass.reward.partnerName}
                </Text>
                <Text variant="labelSm" color={colors.textSecondary}>
                  {activePass.reward.description}
                </Text>
              </View>
              {/* The badge reflects the pass's REAL state: a burned or aged-out
                  pass must never present itself as ACTIVE at a register. */}
              <View
                style={[
                  styles.activeBadge,
                  { backgroundColor: passIsActive ? colors.goldActive : colors.track },
                ]}
              >
                <Text
                  variant="labelSm"
                  color={passIsActive ? colors.ink : colors.textSecondary}
                  style={{ fontWeight: '700' }}
                >
                  {passIsActive ? 'ACTIVE' : activePass.status.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={[styles.qrBox, { borderColor: colors.borderCard, backgroundColor: colors.card }]}>
              {passIsActive ? (
                <>
                  {/* A real, scannable encoding of the code itself — white
                      quiet zone and dark modules regardless of theme, because
                      scanners need the contrast, not the palette. */}
                  <QRCode value={activePass.code} size={180} color="#000000" backgroundColor="#FFFFFF" />
                  <Text style={[Type.numInline, { color: colors.ink, letterSpacing: 3, marginTop: 12 }]}>
                    {formatRewardCode(activePass.code)}
                  </Text>
                </>
              ) : (
                <>
                  <AppIcon name="qr" size={72} color={colors.textTertiary} />
                  <Text variant="label" color={colors.textSecondary} center style={{ marginTop: 10 }}>
                    This pass can no longer be scanned.
                  </Text>
                </>
              )}
            </View>

            <Text variant="labelSm" color={colors.textTertiary} center style={{ marginTop: Spacing.md }}>
              {describePassExpiry(activePass.status, activePass.expiresAt)}
            </Text>
            {passIsActive && (
              <Text variant="labelSm" color={colors.textTertiary} center style={{ marginTop: 4 }}>
                Show this pass at the register. Staff will scan the code, or enter it by hand.
              </Text>
            )}

            <View style={{ marginTop: Spacing.base }}>
              <Button label="Done" variant="secondary" icon="check" onPress={() => setActivePass(null)} />
            </View>
          </View>
        )}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    marginTop: Spacing.base,
    marginBottom: Spacing.base,
  },
  balanceValueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 2 },
  giftBadge: {
    width: 52,
    height: 52,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confetti: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingVertical: 12,
    marginBottom: Spacing.base,
  },
  sectionLabel: { marginBottom: Spacing.md, marginTop: Spacing.xs },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  rewardCard: { width: '48.5%', alignItems: 'center', paddingVertical: Spacing.base, marginBottom: Spacing.md },
  rewardIcon: {
    width: 48,
    height: 48,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  rewardFooter: { marginTop: 10 },
  redeemedRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  costPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: Radius.pill,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  earnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  earnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: Spacing.base,
  },
  sheetBody: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.base },
  sheetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sheetIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  activeBadge: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  qrBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingVertical: Spacing.xl,
    marginTop: Spacing.lg,
  },
});

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, FontFamily } from '../../theme';
import { useUserStore } from '../../store/userStore';
import {
  listRewards,
  getRedeemedRewardIds,
  redeemReward,
  RewardCatalogItem,
} from '../../services/rewardService';
import { getEarnRules, EarnRule } from '../../services/ruleSetService';

export default function RewardsScreen() {
  const user = useUserStore((s) => s.user);
  const adjustPointsLocally = useUserStore((s) => s.adjustPointsLocally);
  const refreshStats = useUserStore((s) => s.refreshStats);

  const [rewards, setRewards] = useState<RewardCatalogItem[]>([]);
  const [earnRules, setEarnRules] = useState<EarnRule[]>([]);
  const [redeemed, setRedeemed] = useState<Set<string>>(new Set());
  const [selectedReward, setSelectedReward] = useState<RewardCatalogItem | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [earnExpanded, setEarnExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRedeeming, setIsRedeeming] = useState(false);

  // On focus: pull the real points balance + the catalog + which rewards this
  // user has already redeemed, so the screen reflects backend truth.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void refreshStats();
      const userId = user?.id;
      (async () => {
        try {
          const [catalog, redeemedIds, rules] = await Promise.all([
            listRewards(),
            getRedeemedRewardIds(),
            userId ? getEarnRules(userId) : Promise.resolve([] as EarnRule[]),
          ]);
          if (active) {
            setRewards(catalog);
            setRedeemed(redeemedIds);
            setEarnRules(rules);
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

  async function handleRedeem(reward: RewardCatalogItem) {
    if (!user || isRedeeming) return;
    setIsRedeeming(true);
    try {
      // Ledger-backed, atomic spend on the backend. The authoritative new balance
      // comes back from the RPC; sync the cached store to it, then refresh.
      const { newBalance } = await redeemReward(reward.id);
      adjustPointsLocally(newBalance - user.points);
      void refreshStats();
      setRedeemed((prev) => new Set(prev).add(reward.id));
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2500);
    } catch (caughtError) {
      Alert.alert(
        'Could not redeem',
        caughtError instanceof Error ? caughtError.message : 'Please try again.',
      );
    } finally {
      setIsRedeeming(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>REWARDS</Text>

        {/* Points Balance — real backend-owned points. */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Your Points</Text>
          <Text style={styles.balanceValue}>{user?.points.toLocaleString() ?? 0}</Text>
          <Text style={styles.balanceSub}>Earn points from logging, streaks & challenges</Text>
        </View>

        {showConfetti && (
          <View style={styles.confettiOverlay}>
            <Text style={styles.confettiText}>🎉 Reward Unlocked! 🎉</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>AVAILABLE REWARDS</Text>
        {isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : rewards.length === 0 ? (
          <Text style={styles.notice}>No rewards available right now. Check back soon.</Text>
        ) : (
          <View style={styles.rewardsGrid}>
            {rewards.map((reward) => {
              const isRedeemed = redeemed.has(reward.id);
              const canAfford = (user?.points ?? 0) >= reward.pointsCost;
              return (
                <TouchableOpacity
                  key={reward.id}
                  style={[styles.rewardCard, isRedeemed && styles.rewardCardRedeemed]}
                  onPress={() => !isRedeemed && setSelectedReward(reward)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rewardLogo}>{reward.partnerLogo}</Text>
                  <Text style={styles.rewardPartner}>{reward.partnerName}</Text>
                  <Text style={styles.rewardDesc}>{reward.description}</Text>
                  <View style={styles.rewardFooter}>
                    {isRedeemed ? (
                      <Text style={styles.redeemedBadge}>✓ Redeemed</Text>
                    ) : (
                      <View style={[styles.costBadge, !canAfford && { opacity: 0.4 }]}>
                        <Text style={styles.costText}>{reward.pointsCost} pts</Text>
                      </View>
                    )}
                  </View>
                  {reward.expiryDate && (
                    <Text style={styles.rewardExpiry}>
                      Expires {new Date(reward.expiryDate).toLocaleDateString()}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* How to Earn */}
        <TouchableOpacity
          style={styles.earnHeader}
          onPress={() => setEarnExpanded(!earnExpanded)}
        >
          <Text style={styles.sectionTitle}>HOW TO EARN</Text>
          <Text style={styles.expandArrow}>{earnExpanded ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {earnExpanded && (
          <View style={styles.earnCard}>
            {earnRules.length === 0 ? (
              <Text style={styles.notice}>Scoring rules unavailable right now.</Text>
            ) : (
              earnRules.map((rule, i) => (
                <View key={i} style={styles.earnRow}>
                  <Text style={styles.earnAction}>{rule.action}</Text>
                  <Text style={styles.earnPts}>+{rule.points} pts</Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reward Detail Modal */}
      <Modal visible={!!selectedReward} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {selectedReward && (
              <>
                <Text style={styles.modalLogo}>{selectedReward.partnerLogo}</Text>
                <Text style={styles.modalPartner}>{selectedReward.partnerName}</Text>
                <Text style={styles.modalDesc}>{selectedReward.description}</Text>

                <View style={styles.qrPlaceholder}>
                  <Text style={styles.qrText}>[ QR CODE ]</Text>
                  <Text style={styles.qrSub}>Show at register</Text>
                </View>

                <Text style={styles.modalCost}>{selectedReward.pointsCost} points</Text>

                <TouchableOpacity
                  style={[
                    styles.unlockBtn,
                    ((user?.points ?? 0) < selectedReward.pointsCost || isRedeeming) &&
                      styles.unlockBtnDisabled,
                  ]}
                  onPress={() => {
                    const reward = selectedReward;
                    setSelectedReward(null);
                    void handleRedeem(reward);
                  }}
                  disabled={(user?.points ?? 0) < selectedReward.pointsCost || isRedeeming}
                >
                  <Text style={styles.unlockBtnText}>
                    {isRedeeming
                      ? 'REDEEMING...'
                      : (user?.points ?? 0) >= selectedReward.pointsCost
                        ? 'UNLOCK REWARD'
                        : 'NOT ENOUGH POINTS'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setSelectedReward(null)}>
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60 },
  title: {
    fontFamily: FontFamily.displayBold,
    fontSize: 24,
    color: Colors.textPrimary,
    letterSpacing: 1,
    marginBottom: 16,
  },
  balanceCard: {
    backgroundColor: Colors.primary + '10',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  balanceLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary },
  balanceValue: { fontFamily: FontFamily.displayBold, fontSize: 42, color: Colors.primary, marginVertical: 4 },
  balanceSub: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary },
  confettiOverlay: {
    backgroundColor: Colors.gold + '18',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  confettiText: { fontFamily: FontFamily.displayBold, fontSize: 18, color: Colors.gold },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  loadingBox: { paddingVertical: 30, alignItems: 'center' },
  notice: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.textSecondary, paddingVertical: 8 },
  rewardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 24 },
  rewardCard: {
    width: '48%',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  rewardCardRedeemed: { borderColor: Colors.primary + '44', backgroundColor: Colors.primary + '08' },
  rewardLogo: { fontSize: 36, marginBottom: 8 },
  rewardPartner: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.textPrimary, textAlign: 'center' },
  rewardDesc: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, textAlign: 'center', marginTop: 4 },
  rewardFooter: { marginTop: 10 },
  costBadge: {
    backgroundColor: Colors.primary + '18',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  costText: { fontFamily: FontFamily.displayBold, fontSize: 12, color: Colors.primary },
  redeemedBadge: { fontFamily: FontFamily.bodySemiBold, fontSize: 12, color: Colors.primary },
  rewardExpiry: { fontFamily: FontFamily.body, fontSize: 10, color: Colors.textSecondary, marginTop: 6 },
  earnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  expandArrow: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary },
  earnCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  earnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  earnAction: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary },
  earnPts: { fontFamily: FontFamily.displayBold, fontSize: 14, color: Colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalLogo: { fontSize: 48, marginBottom: 12 },
  modalPartner: { fontFamily: FontFamily.displayBold, fontSize: 22, color: Colors.textPrimary },
  modalDesc: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.textSecondary, marginTop: 4, textAlign: 'center' },
  qrPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 12,
    backgroundColor: Colors.surface2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
  },
  qrText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary },
  qrSub: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  modalCost: { fontFamily: FontFamily.displayBold, fontSize: 18, color: Colors.primary, marginBottom: 16 },
  unlockBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginBottom: 12,
  },
  unlockBtnDisabled: { backgroundColor: Colors.surface2 },
  unlockBtnText: { fontFamily: FontFamily.displayBold, fontSize: 15, color: Colors.background },
  closeText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textSecondary },
});

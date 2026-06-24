import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors, FontFamily } from '../theme';
import { ChallengeStatus, ChallengeType } from '../services/challengeService';

interface ChallengeCardProps {
  name: string;
  type: ChallengeType;
  stakesText: string;
  endDate: string;
  status: ChallengeStatus;
  participantCount: number;
  joined: boolean;
  onPress?: () => void;
}

function getTimeRemaining(endDate: string, status: ChallengeStatus): string {
  if (status === 'completed') return 'Ended';
  if (status === 'upcoming') return `Starts soon`;
  const diff = new Date(`${endDate}T23:59:59`).getTime() - Date.now();
  if (diff <= 0) return 'Ending today';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

export default function ChallengeCard({
  name,
  type,
  stakesText,
  endDate,
  status,
  participantCount,
  joined,
  onPress,
}: ChallengeCardProps) {
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(endDate, status));

  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(getTimeRemaining(endDate, status)), 60000);
    return () => clearInterval(timer);
  }, [endDate, status]);

  const typeBadge = type === 'solo' ? 'Solo' : 'Team';
  const typeBadgeColor = type === 'solo' ? Colors.primary : Colors.accent;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.header}>
        <Text style={styles.name}>{name}</Text>
        <View style={[styles.badge, { backgroundColor: typeBadgeColor + '22', borderColor: typeBadgeColor }]}>
          <Text style={[styles.badgeText, { color: typeBadgeColor }]}>{typeBadge}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.timeLeft}>{timeLeft}</Text>
        <Text style={styles.stakes} numberOfLines={1}>{stakesText}</Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.participants}>
          {participantCount} {participantCount === 1 ? 'player' : 'players'}
        </Text>
        {joined && (
          <View style={styles.joinedPill}>
            <Text style={styles.joinedText}>✓ Joined</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  name: { fontFamily: FontFamily.displayBold, fontSize: 18, color: Colors.textPrimary, flex: 1, marginRight: 8 },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontFamily: FontFamily.bodySemiBold, fontSize: 11 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  timeLeft: { fontFamily: FontFamily.bodyMedium, fontSize: 13, color: Colors.accent },
  stakes: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, maxWidth: '55%', textAlign: 'right' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  participants: { fontFamily: FontFamily.bodyMedium, fontSize: 12, color: Colors.textSecondary },
  joinedPill: {
    backgroundColor: Colors.primary + '14',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.primary + '33',
  },
  joinedText: { fontFamily: FontFamily.bodySemiBold, fontSize: 11, color: Colors.primary },
});

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme';
import { ChallengeStatus, ChallengeType } from '../services/challengeService';
import { Card, Text, AppIcon } from './ui';

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
  const { colors } = useTheme();
  const [timeLeft, setTimeLeft] = useState(getTimeRemaining(endDate, status));

  useEffect(() => {
    // Props can change after a refetch; update immediately instead of showing
    // the previous challenge/status until the first one-minute timer tick.
    setTimeLeft(getTimeRemaining(endDate, status));
    const timer = setInterval(() => setTimeLeft(getTimeRemaining(endDate, status)), 60000);
    return () => clearInterval(timer);
  }, [endDate, status]);

  // solo = scarlet tint · team = streak (momentum) tint
  const soloType = type === 'solo';
  const badgeBg = soloType ? colors.brandTint : colors.streakTint;
  const badgeFg = soloType ? colors.scarlet : colors.streak;

  const timeColor =
    status === 'completed'
      ? colors.textTertiary
      : status === 'active'
      ? colors.scarlet
      : colors.textSecondary;

  return (
    <Card onPress={onPress} style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Text variant="subhead" color={colors.ink} style={{ flex: 1, marginRight: 8 }} numberOfLines={1}>
          {name}
        </Text>
        <View
          style={{
            backgroundColor: badgeBg,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 3,
          }}
        >
          <Text color={badgeFg} style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 11, lineHeight: 14 }}>
            {soloType ? 'Solo' : 'Team'}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <AppIcon name="clock" size={13} color={timeColor} />
        <Text variant="numInline" color={timeColor}>
          {timeLeft}
        </Text>
        {stakesText ? (
          <Text
            variant="label"
            color={colors.textSecondary}
            numberOfLines={1}
            style={{ flex: 1, textAlign: 'right' }}
          >
            {stakesText}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="label" color={colors.textSecondary}>
          {participantCount} {participantCount === 1 ? 'player' : 'players'}
        </Text>
        {joined && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              backgroundColor: colors.successTint,
              borderRadius: 99,
              paddingHorizontal: 10,
              paddingVertical: 3,
            }}
          >
            <AppIcon name="check" size={13} color={colors.successDeep} />
            <Text color={colors.successDeep} style={{ fontFamily: 'DMSans_600SemiBold', fontSize: 11 }}>
              Joined
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

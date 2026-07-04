import React, { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useTheme } from '../theme';
import { Text, Avatar, AppIcon } from './ui';
import PixelFlame from './PixelFlame';
import { AppIconName } from './ui/AppIcon';

interface ActivityFeedItemProps {
  name: string;
  /** Activity icon, or the reserved "streak" key for the sourced flame art. */
  icon: AppIconName | 'streak';
  text: string;
  minutesAgo: number;
  showDivider?: boolean;
}

function relativeTime(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** One social activity row: avatar, what happened, time, and a flame reaction. */
export default function ActivityFeedItem({
  name,
  icon,
  text,
  minutesAgo,
  showDivider = false,
}: ActivityFeedItemProps) {
  const { colors } = useTheme();
  const [reacted, setReacted] = useState(false);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderTopWidth: showDivider ? 1 : 0,
        borderTopColor: colors.rowDivider,
      }}
    >
      <Avatar name={name} size={32} />
      <View style={{ flex: 1 }}>
        <Text variant="body" color={colors.ink} numberOfLines={2} style={{ fontSize: 13, lineHeight: 18 }}>
          {text}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
          {icon === 'streak' ? <PixelFlame size={11} /> : <AppIcon name={icon} size={11} color={colors.textTertiary} />}
          <Text variant="labelSm" color={colors.textTertiary}>{relativeTime(minutesAgo)}</Text>
        </View>
      </View>
      <Pressable
        onPress={() => setReacted((r) => !r)}
        accessibilityRole="button"
        accessibilityLabel="React with fire"
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: reacted ? colors.streakTint : colors.canvas,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AppIcon name="flame" size={15} color={reacted ? colors.streak : colors.textTertiary} />
      </Pressable>
    </View>
  );
}

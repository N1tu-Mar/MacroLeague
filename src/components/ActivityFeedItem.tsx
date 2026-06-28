import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing, alpha } from '../theme';
import Avatar from './ui/Avatar';
import PixelFlame from './PixelFlame';
import AppIcon, { AppIconName } from './ui/AppIcon';

interface ActivityFeedItemProps {
  name: string;
  /** Activity icon, or the reserved "streak" key for the sourced flame art. */
  icon: AppIconName | 'streak';
  text: string;
  minutesAgo: number;
  reactions?: number;
}

function relativeTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/** One social activity row: avatar, who + what, time, and a small reaction count. */
export default function ActivityFeedItem({ name, icon, text, minutesAgo, reactions = 0 }: ActivityFeedItemProps) {
  return (
    <View style={styles.row}>
      <Avatar name={name} size={36} />
      <View style={styles.body}>
        <Text style={styles.text} numberOfLines={2}>
          {text}
        </Text>
        <View style={styles.metaRow}>
          {icon === 'streak' ? <PixelFlame size={11} /> : <AppIcon name={icon} size={11} />}
          <Text style={styles.meta}>· {relativeTime(minutesAgo)} ago</Text>
        </View>
      </View>
      {reactions > 0 ? (
        <View style={styles.reactions}>
          <AppIcon name="reaction" size={12} color={Colors.textSecondary} />
          <Text style={styles.reactionText}>{reactions}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  body: { flex: 1 },
  text: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, lineHeight: 19 },
  name: { fontFamily: FontFamily.bodySemiBold, color: Colors.textPrimary },
  meta: { fontFamily: FontFamily.body, fontSize: FontSize.micro, color: Colors.textTertiary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  reactions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: alpha(Colors.primary, 0.1),
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
  },
  reactionText: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.micro, color: Colors.textSecondary },
});

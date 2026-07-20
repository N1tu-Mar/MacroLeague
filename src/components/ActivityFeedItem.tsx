import React from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useTheme, FontFamily } from '../theme';
import { Text, Avatar, AppIcon } from './ui';
import PixelFlame from './PixelFlame';
import { AppIconName } from './ui/AppIcon';

interface ActivityFeedItemProps {
  name: string;
  /** Profile photo, when the row is about a real person with one set. */
  avatarUrl?: string | null;
  /** Activity icon, or the reserved "streak" key for the sourced flame art. */
  icon: AppIconName | 'streak';
  text: string;
  minutesAgo: number;
  showDivider?: boolean;
  /**
   * Render the actor's name in front of the text ("Maya logged a meal").
   * Off for the viewer's own activity, where the name would be redundant.
   */
  showName?: boolean;
  /**
   * Reaction state, persisted server-side.
   *
   * The reaction button previously toggled a local useState that was never sent
   * anywhere — it looked like it worked and reset on every re-render. Supplying
   * onReact makes the button real; omitting it hides the button entirely rather
   * than showing a control that does nothing.
   */
  reactionCount?: number;
  reacted?: boolean;
  onReact?: () => void;
  reactionPending?: boolean;
  onPressActor?: () => void;
}

function relativeTime(minutes: number): string {
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** One activity row: avatar, what happened, time, and an optional reaction. */
export default function ActivityFeedItem({
  name,
  avatarUrl,
  icon,
  text,
  minutesAgo,
  showDivider = false,
  showName = false,
  reactionCount = 0,
  reacted = false,
  onReact,
  reactionPending = false,
  onPressActor,
}: ActivityFeedItemProps) {
  const { colors } = useTheme();

  const avatar = <Avatar name={name} uri={avatarUrl} size={32} />;

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
      {onPressActor ? (
        <Pressable
          onPress={onPressActor}
          accessibilityRole="button"
          accessibilityLabel={`View ${name}'s profile`}
        >
          {avatar}
        </Pressable>
      ) : (
        avatar
      )}

      <View style={{ flex: 1 }}>
        <Text
          variant="body"
          color={colors.ink}
          numberOfLines={2}
          style={{ fontSize: 13, lineHeight: 18 }}
        >
          {showName ? (
            <Text
              variant="body"
              color={colors.ink}
              style={{ fontSize: 13, lineHeight: 18, fontFamily: FontFamily.semibold }}
            >
              {name}{' '}
            </Text>
          ) : null}
          {text}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 }}>
          {icon === 'streak' ? (
            <PixelFlame size={11} />
          ) : (
            <AppIcon name={icon} size={11} color={colors.textTertiary} />
          )}
          <Text variant="labelSm" color={colors.textTertiary}>
            {relativeTime(minutesAgo)}
          </Text>
        </View>
      </View>

      {onReact ? (
        <Pressable
          onPress={onReact}
          disabled={reactionPending}
          accessibilityRole="button"
          accessibilityState={{ selected: reacted, disabled: reactionPending }}
          accessibilityLabel={
            reacted ? `Remove your reaction from ${name}` : `React to ${name}'s activity`
          }
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            height: 32,
            minWidth: 32,
            paddingHorizontal: reactionCount > 0 ? 8 : 0,
            justifyContent: 'center',
            borderRadius: 10,
            backgroundColor: reacted ? colors.streakTint : colors.canvas,
            opacity: reactionPending ? 0.6 : 1,
          }}
        >
          {reactionPending ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <>
              <AppIcon
                name="flame"
                size={15}
                color={reacted ? colors.streak : colors.textTertiary}
              />
              {reactionCount > 0 ? (
                <Text
                  variant="labelSm"
                  color={reacted ? colors.streak : colors.textTertiary}
                >
                  {reactionCount}
                </Text>
              ) : null}
            </>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

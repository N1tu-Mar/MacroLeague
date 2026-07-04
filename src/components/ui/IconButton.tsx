import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';
import AppIcon, { AppIconName } from './AppIcon';

interface IconButtonProps {
  icon: AppIconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  bg?: string;
  border?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Rounded-square icon button (spec: 44px back button / header actions). Renders
 * a card-colored tile with an optional hairline border by default.
 */
export default function IconButton({
  icon,
  onPress,
  size = 44,
  iconSize = 22,
  color,
  bg,
  border = true,
  accessibilityLabel,
  style,
}: IconButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={6}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg ?? colors.card,
          borderWidth: border ? 1 : 0,
          borderColor: colors.borderCard,
          opacity: pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <AppIcon name={icon} size={iconSize} color={color ?? colors.ink} />
    </Pressable>
  );
}

import React from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import { Radius, useTheme } from '../../theme';
import AppIcon, { AppIconName } from './AppIcon';
import Text from './Text';

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: AppIconName;
  /** Rounded pill (default) vs 12-radius tile (goal chips). */
  shape?: 'pill' | 'tile';
  style?: StyleProp<ViewStyle>;
}

/**
 * Selectable chip (spec F4). Selected = ink fill / white text; unselected =
 * bordered / ink text.
 */
export default function Chip({
  label,
  selected = false,
  onPress,
  icon,
  shape = 'pill',
  style,
}: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
          paddingHorizontal: 14,
          borderRadius: shape === 'pill' ? Radius.pill : 12,
          backgroundColor: selected ? colors.ink : colors.card,
          borderWidth: selected ? 0 : 1.5,
          borderColor: colors.borderInput,
        },
        style,
      ]}
    >
      {icon ? (
        <AppIcon
          name={icon}
          size={15}
          color={selected ? colors.card : colors.ink}
        />
      ) : null}
      <Text
        variant="cardTitle"
        color={selected ? colors.card : colors.ink}
      >
        {label}
      </Text>
    </Pressable>
  );
}

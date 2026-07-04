import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../theme';

/** Hairline divider (spec: section divider inside cards / list-row separator). */
export default function Divider({
  color,
  inset = 0,
  style,
}: {
  color?: string;
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          height: 1,
          backgroundColor: color ?? colors.rowDivider,
          marginHorizontal: inset,
        },
        style,
      ]}
    />
  );
}

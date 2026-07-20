import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { Radius, useTheme } from '../../theme';

/**
 * One row of a virtualized list that must *look* like it lives inside a
 * `<Card padded={false} style={{ overflow: 'hidden' }}>`.
 *
 * A FlatList cannot be wrapped in a Card without turning the card into its own
 * nested scroll container, so instead each cell carries the card surface: the
 * card background and side borders on every row, plus the top/bottom border and
 * corner radii on the first/last row. Visually this is identical to the
 * ScrollView + `.map()` markup it replaced.
 */
export default function CardListItem({
  first,
  last,
  children,
  style,
}: {
  first: boolean;
  last: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderColor: colors.borderCard,
          borderLeftWidth: 1,
          borderRightWidth: 1,
        },
        first && {
          borderTopWidth: 1,
          borderTopLeftRadius: Radius.card,
          borderTopRightRadius: Radius.card,
        },
        last && {
          borderBottomWidth: 1,
          borderBottomLeftRadius: Radius.card,
          borderBottomRightRadius: Radius.card,
        },
        // Matches the Card's `overflow: 'hidden'` so a tinted row (the current
        // user) can't paint outside the rounded corners.
        (first || last) && { overflow: 'hidden' },
        style,
      ]}
    >
      {children}
    </View>
  );
}

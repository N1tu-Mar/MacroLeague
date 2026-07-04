import React from 'react';
import {
  View,
  ScrollView,
  StyleProp,
  ViewStyle,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spacing, useTheme } from '../../theme';

interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Apply 20px horizontal screen padding. */
  padded?: boolean;
  /** Extra bottom space (e.g. to clear the tab bar). */
  bottomSpace?: number;
  /** Include the top safe-area inset as padding. */
  topInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  onRefresh?: () => void;
  refreshing?: boolean;
}

/**
 * Canvas-colored screen container that handles the status-bar inset and the
 * standard 20px gutter, so screens stop hand-rolling `paddingTop: 60`. Set
 * `scroll` for scrolling content; `bottomSpace` to clear the tab bar/FAB.
 */
export default function Screen({
  children,
  scroll = false,
  padded = true,
  bottomSpace = Spacing.xl,
  topInset = true,
  style,
  contentStyle,
  onRefresh,
  refreshing,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pad = {
    paddingTop: topInset ? insets.top + Spacing.sm : Spacing.sm,
    paddingHorizontal: padded ? Spacing.screen : 0,
  };

  if (scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.canvas }, style]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            pad,
            { paddingBottom: insets.bottom + bottomSpace },
            contentStyle,
          ]}
          refreshControl={
            onRefresh
              ? (
                <RefreshControl
                  refreshing={!!refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.textSecondary}
                />
              )
              : undefined
          }
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View
      style={[
        { flex: 1, backgroundColor: colors.canvas },
        pad,
        { paddingBottom: insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

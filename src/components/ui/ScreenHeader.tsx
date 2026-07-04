import React from 'react';
import { View, StyleProp, ViewStyle } from 'react-native';
import { FontFamily, useTheme } from '../../theme';
import IconButton from './IconButton';
import Text from './Text';

interface ScreenHeaderProps {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Onboarding-style segmented progress instead of a title. */
  progress?: { step: number; total: number };
  style?: StyleProp<ViewStyle>;
}

/** Segmented progress bar (spec Onboarding): filled scarlet up to `step`. */
export function ProgressSegments({ step, total }: { step: number; total: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            backgroundColor: i < step ? colors.scarlet : colors.borderCard,
          }}
        />
      ))}
    </View>
  );
}

/**
 * Top-of-screen header: a 44px back button plus either a title, an onboarding
 * progress bar, or a custom right slot.
 */
export default function ScreenHeader({
  title,
  onBack,
  right,
  progress,
  style,
}: ScreenHeaderProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 },
        style,
      ]}
    >
      {onBack ? (
        <IconButton
          icon="chevron-left"
          onPress={onBack}
          accessibilityLabel="Back"
          style={{ marginLeft: -4 }}
        />
      ) : null}
      {progress ? (
        <>
          <ProgressSegments step={progress.step} total={progress.total} />
          <Text
            color={colors.textSecondary}
            style={{
              fontFamily: FontFamily.numSemibold,
              fontSize: 12,
              letterSpacing: 0.7,
            }}
          >
            {progress.step} / {progress.total}
          </Text>
        </>
      ) : (
        <>
          {title ? (
            <Text variant="heading" color={colors.ink} style={{ flex: 1 }}>
              {title}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {right}
        </>
      )}
    </View>
  );
}

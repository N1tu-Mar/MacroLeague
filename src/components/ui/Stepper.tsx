import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Type, useTheme } from '../../theme';
import AppIcon from './AppIcon';
import Text from './Text';

interface StepperButtonsProps {
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  size?: number;
  label?: string;
}

/** Just the −/+ pair (spec: 36px square bordered buttons). */
export function StepperButtons({
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  size = 36,
  label,
}: StepperButtonsProps) {
  const { colors } = useTheme();
  const btn = (
    onPress: () => void,
    enabled: boolean,
    icon: 'minus' | 'plus',
    a11y: string,
  ) => (
    <Pressable
      onPress={enabled ? onPress : undefined}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: colors.borderInput,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: enabled ? 1 : 0.4,
      }}
    >
      <AppIcon name={icon} size={16} color={colors.ink} />
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {btn(onDecrement, canDecrement, 'minus', `Decrease ${label ?? ''}`)}
      {btn(onIncrement, canIncrement, 'plus', `Increase ${label ?? ''}`)}
    </View>
  );
}

interface TargetRowProps {
  label: string;
  value: string | number;
  unit?: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  showDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * A target/goal row (spec Onboarding targets & Settings): label + big Barlow
 * value on the left, −/+ stepper on the right.
 */
export function TargetRow({
  label,
  value,
  unit,
  onDecrement,
  onIncrement,
  canDecrement = true,
  canIncrement = true,
  showDivider = true,
  style,
}: TargetRowProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: 16,
          borderBottomWidth: showDivider ? 1 : 0,
          borderBottomColor: colors.hairline,
        },
        style,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text variant="label" color={colors.textSecondary}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
          <Text style={[Type.scoreStat, { fontSize: 32, color: colors.ink }]}>
            {value}
          </Text>
          {unit ? (
            <Text variant="subhead" color={colors.textSecondary}>
              {unit}
            </Text>
          ) : null}
        </View>
      </View>
      <StepperButtons
        label={label}
        onDecrement={onDecrement}
        onIncrement={onIncrement}
        canDecrement={canDecrement}
        canIncrement={canIncrement}
      />
    </View>
  );
}

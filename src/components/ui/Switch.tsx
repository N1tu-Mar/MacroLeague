import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
} from 'react-native-reanimated';
import { useTheme } from '../../theme';

interface SwitchProps {
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
  /**
   * Screen-reader name for the switch. Without it a toggle announces only its
   * on/off state, which is meaningless when several sit in one list.
   */
  accessibilityLabel?: string;
}

/**
 * Custom 46×28 switch (spec F4). On = success track, off = neutral track, with
 * a 24px white knob that slides. Built so it looks identical on iOS/Android/web.
 */
export default function Switch({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
}: SwitchProps) {
  const { colors } = useTheme();
  const t = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    t.value = withTiming(value ? 1 : 0, { duration: 160 });
  }, [value]);

  const trackStyle = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(
        t.value,
        [0, 1],
        [colors.switchOff, colors.success],
      ),
    }),
    [t, colors],
  );

  const knobStyle = useAnimatedStyle(
    () => ({ transform: [{ translateX: 2 + t.value * 18 }] }),
    [t],
  );

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Animated.View
        style={[
          { width: 46, height: 28, borderRadius: 99, justifyContent: 'center' },
          trackStyle,
        ]}
      >
        <Animated.View
          style={[
            {
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: '#FFFFFF',
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
              elevation: 2,
            },
            knobStyle,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { FontFamily, useTheme } from '../theme';

interface FloatingXPProps {
  amount: number;
  visible: boolean;
  onDone?: () => void;
  /** Skip the entrance/exit animation for reduced-motion and static contexts. */
  animated?: boolean;
}

export default function FloatingXP({ amount, visible, onDone, animated = true }: FloatingXPProps) {
  const { colors } = useTheme();
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);

  useEffect(() => {
    if (visible) {
      if (!animated) {
        translateY.value = -40;
        opacity.value = 1;
        scale.value = 1;
        return;
      }

      translateY.value = 0;
      opacity.value = 0;
      scale.value = 0.5;

      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.back(2)) });
      translateY.value = withTiming(-80, { duration: 1500, easing: Easing.out(Easing.cubic) });
      opacity.value = withDelay(
        1000,
        withTiming(0, { duration: 500 }, (finished) => {
          if (finished && onDone) runOnJS(onDone)();
        })
      );
    }
  }, [visible, animated]);

  // Explicit deps: required on web (no Reanimated Babel plugin there).
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }), [translateY, scale, opacity]);

  if (!visible) return null;

  return (
    <Animated.Text style={[styles.text, { color: colors.success }, animatedStyle]}>
      +{amount} XP
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  text: {
    position: 'absolute',
    alignSelf: 'center',
    top: '40%',
    fontFamily: FontFamily.numBold,
    fontSize: 34,
    zIndex: 999,
  },
});

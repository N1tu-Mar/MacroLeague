import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Radius, Motion } from '../../theme';

interface ProgressBarProps {
  /** 0..1; values above 1 are clamped for the fill but caller can color-flag over-target. */
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** Skip the fill animation (e.g. for static rows). */
  animated?: boolean;
}

/**
 * Generic animated fill bar. The fill grows from its current width to the target
 * over Motion.progress so logging a meal visibly "moves" the bar. Rounded track
 * + rounded fill for the soft, friendly look.
 */
export default function ProgressBar({
  progress,
  color = Colors.primary,
  trackColor = Colors.track,
  height = 10,
  style,
  animated = true,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const width = useSharedValue(animated ? 0 : clamped);

  useEffect(() => {
    if (animated) {
      width.value = withTiming(clamped, {
        duration: Motion.progress,
        easing: Easing.out(Easing.cubic),
      });
    } else {
      width.value = clamped;
    }
  }, [clamped, animated]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value * 100}%`,
  }));

  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }, style]}>
      <Animated.View
        style={[
          styles.fill,
          { borderRadius: height / 2, backgroundColor: color },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
});

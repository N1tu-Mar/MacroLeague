import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors, FontFamily } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface MacroRingProps {
  label: string;
  current: number;
  goal: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

export default function MacroRing({
  label,
  current,
  goal,
  size = 72,
  strokeWidth = 6,
  color,
}: MacroRingProps) {
  const progress = useSharedValue(0);
  const rawRatio = goal > 0 ? current / goal : 0;
  const ratio = Math.max(0, Math.min(rawRatio, 1));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let ringColor = color ?? Colors.primary;
  if (!color) {
    if (rawRatio > 1) ringColor = Colors.error;
    else if (ratio < 0.5) ringColor = Colors.accent;
  }

  useEffect(() => {
    progress.value = withTiming(ratio, { duration: 1000, easing: Easing.out(Easing.cubic) });
  }, [ratio]);

  // Explicit deps: required on web (no Reanimated Babel plugin there).
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }), [progress, circumference]);

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.surface2}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.labelCenter]}>
          <Text style={[styles.value, { color: ringColor }]}>{current}</Text>
        </View>
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.goalText}>/ {goal}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  labelCenter: { alignItems: 'center', justifyContent: 'center' },
  value: {
    fontFamily: FontFamily.displayBold,
    fontSize: 16,
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: 11,
    color: Colors.textPrimary,
    marginTop: 6,
  },
  goalText: {
    fontFamily: FontFamily.body,
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 1,
  },
});

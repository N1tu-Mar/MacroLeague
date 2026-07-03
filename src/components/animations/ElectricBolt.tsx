import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../../theme';
import AppIcon from '../ui/AppIcon';

interface ElectricBoltProps {
  size?: number;
}

/** Layered XP bolt with an irregular electric-outline pulse. */
export default function ElectricBolt({ size = 24 }: ElectricBoltProps) {
  const energy = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    energy.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(0.35, { duration: 90 }),
        withTiming(0.9, { duration: 130 }),
        withTiming(0, { duration: 620, easing: Easing.out(Easing.cubic) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(energy);
  }, [energy, reduceMotion]);

  // Explicit deps: required on web (no Reanimated Babel plugin there).
  const outlineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(energy.value, [0, 1], [0.18, 0.95]),
    transform: [{ scale: interpolate(energy.value, [0, 1], [1, 1.16]) }],
  }), [energy]);

  const sparkStyle = useAnimatedStyle(() => ({
    opacity: interpolate(energy.value, [0, 0.55, 1], [0, 0.2, 1]),
    transform: [{ scale: interpolate(energy.value, [0, 1], [0.4, 1.2]) }],
  }), [energy]);

  const frame = size + 10;
  return (
    <View style={[styles.frame, { width: frame, height: frame }]}>
      <Animated.View style={[styles.layer, outlineStyle]}>
        <AppIcon name="bolt" size={size + 5} color="#70DFFF" strokeWidth={3.4} />
      </Animated.View>
      <View style={styles.layer}>
        <AppIcon name="bolt" size={size} color={Colors.accent} strokeWidth={2.4} />
      </View>
      <Animated.View style={[styles.sparkTop, sparkStyle]} />
      <Animated.View style={[styles.sparkBottom, sparkStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  sparkTop: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 2,
    top: 1,
    right: 3,
    backgroundColor: '#BDF4FF',
    shadowColor: '#70DFFF',
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
  sparkBottom: {
    position: 'absolute',
    width: 4,
    height: 2,
    borderRadius: 2,
    bottom: 2,
    left: 2,
    backgroundColor: '#70DFFF',
    shadowColor: '#70DFFF',
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },
});

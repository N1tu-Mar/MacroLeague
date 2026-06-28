import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

interface ClashingUtensilsProps {
  size?: number;
}

/** Separate silver fork and knife paths that sweep inward and meet like blades. */
export default function ClashingUtensils({ size = 26 }: ClashingUtensilsProps) {
  const clash = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    clash.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 300, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 480, easing: Easing.out(Easing.back(1.4)) }),
        withDelay(700, withTiming(0, { duration: 1 })),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(clash);
  }, [clash, reduceMotion]);

  const forkStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(clash.value, [0, 1], [-1, 3]) },
      { rotate: `${interpolate(clash.value, [0, 1], [-12, 18])}deg` },
    ],
  }));
  const knifeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(clash.value, [0, 1], [1, -3]) },
      { rotate: `${interpolate(clash.value, [0, 1], [12, -18])}deg` },
    ],
  }));
  const flashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(clash.value, [0, 0.82, 1], [0, 0, 1]),
    transform: [{ scale: interpolate(clash.value, [0, 1], [0.3, 1.25]) }],
  }));

  return (
    <View style={[styles.frame, { width: size + 8, height: size + 8 }]}>
      <Animated.View style={[styles.layer, forkStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" fill="none" stroke="#C9D0D8" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
          <Path d="M7 2v20" fill="none" stroke="#EEF2F5" strokeLinecap="round" strokeWidth={2} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.layer, knifeStyle]}>
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" fill="none" stroke="#EEF2F5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
        </Svg>
      </Animated.View>
      <Animated.View style={[styles.flash, flashStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  flash: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.9,
    shadowRadius: 5,
  },
});

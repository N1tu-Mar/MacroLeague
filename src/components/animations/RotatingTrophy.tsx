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
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../../theme';
import AppIcon from '../ui/AppIcon';

interface RotatingTrophyProps {
  size?: number;
  color?: string;
}

/** In-place perspective turn that keeps the trophy anchored while showing both sides. */
export default function RotatingTrophy({ size = 24, color = Colors.gold }: RotatingTrophyProps) {
  const turn = useSharedValue(0);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    turn.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(turn);
  }, [reduceMotion, turn]);

  const turnStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 320 }, { rotateY: `${turn.value}deg` }],
  }));
  const glintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(turn.value, [0, 70, 90, 110, 250, 270, 290, 360], [0, 0, 0.9, 0, 0, 0.7, 0, 0]),
  }));

  return (
    <View style={[styles.frame, { width: size + 6, height: size + 6 }]}>
      <Animated.View style={[styles.layer, turnStyle]}>
        <AppIcon name="trophy" size={size} color={color} strokeWidth={2.25} />
        <Animated.View style={[styles.glint, { height: size * 0.72 }, glintStyle]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', justifyContent: 'center' },
  layer: { alignItems: 'center', justifyContent: 'center' },
  glint: {
    position: 'absolute',
    width: 2,
    borderRadius: 2,
    backgroundColor: '#FFF8D8',
    transform: [{ rotate: '12deg' }],
  },
});

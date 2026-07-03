import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, FontFamily } from '../theme';
import PixelFlame from './PixelFlame';

interface StreakFlameProps {
  count: number;
  size?: 'small' | 'large';
}

export default function StreakFlame({ count, size = 'small' }: StreakFlameProps) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 800 }),
        withTiming(1, { duration: 800 })
      ),
      -1,
      true
    );
  }, []);

  // Explicit deps: required on web (no Reanimated Babel plugin there).
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }), [scale]);

  const isLarge = size === 'large';
  const flameSize = isLarge ? 48 : 20;
  const fontSize = isLarge ? 28 : 14;

  return (
    <View style={styles.row}>
      <Animated.View style={animatedStyle}>
        <PixelFlame size={flameSize} animated />
      </Animated.View>
      <Text
        style={[
          styles.count,
          {
            fontSize,
            color: count >= 7 ? Colors.accent : Colors.textPrimary,
          },
        ]}
      >
        {count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  count: {
    fontFamily: FontFamily.displayBold,
  },
});

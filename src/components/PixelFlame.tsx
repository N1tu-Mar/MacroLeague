import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';

const flameSheet = require('../../assets/game-art/streak-fire.png');
const FRAME_COUNT = 6;

interface PixelFlameProps {
  size?: number;
  animated?: boolean;
}

/** Hand-authored six-frame pixel flame sourced under CC0; see assets/game-art. */
export default function PixelFlame({ size = 24, animated = false }: PixelFlameProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!animated) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % FRAME_COUNT);
    }, 140);

    return () => clearInterval(timer);
  }, [animated]);

  return (
    <View
      accessible
      accessibilityLabel="Streak flame"
      style={[styles.viewport, { width: size, height: size }]}
    >
      <Image
        resizeMode="stretch"
        source={flameSheet}
        style={[
          {
            width: size * FRAME_COUNT,
            height: size,
            transform: [{ translateX: -frame * size }],
          },
          Platform.OS === 'web' ? ({ imageRendering: 'pixelated' } as any) : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
  },
});

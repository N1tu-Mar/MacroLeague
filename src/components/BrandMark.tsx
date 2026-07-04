import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FontFamily, useTheme } from '../theme';
import { Text } from './ui';

/**
 * The MacroLeague shield mark: an ink shield with a scarlet "ML" wordmark in
 * Barlow Condensed. Vector, so it stays crisp at any size on all platforms.
 */
export default function BrandMark({ size = 30 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 2 L20.5 5.2 V12.2 C20.5 17.4 17 21 12 22.6 C7 21 3.5 17.4 3.5 12.2 V5.2 Z"
          fill={colors.ink}
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: size * 0.12,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          color={colors.scarlet}
          style={{ fontFamily: FontFamily.numBold, fontSize: size * 0.36 }}
        >
          ML
        </Text>
      </View>
    </View>
  );
}

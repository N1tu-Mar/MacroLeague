import React from 'react';
import {
  Text as RNText,
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
} from 'react-native';
import { Type, useTheme } from '../../theme';

type Variant = keyof typeof Type;

export interface TextProps extends RNTextProps {
  variant?: Variant;
  /** Resolved color (e.g. `colors.textSecondary`). Defaults to ink. */
  color?: string;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  children?: React.ReactNode;
}

/**
 * Themed text. Pick a typographic `variant` (spec role) and optionally a
 * resolved `color`; everything else is a normal <Text>. Barlow Condensed is
 * baked into the score/num variants, DM Sans into the rest.
 */
export default function Text({
  variant = 'body',
  color,
  center,
  style,
  children,
  ...rest
}: TextProps) {
  const { colors } = useTheme();
  return (
    <RNText
      style={[
        Type[variant],
        { color: color ?? colors.ink },
        center && { textAlign: 'center' },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

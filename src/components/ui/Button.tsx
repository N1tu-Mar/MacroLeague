import React from 'react';
import {
  Pressable,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { Type, Radius, useTheme } from '../../theme';
import AppIcon, { AppIconName } from './AppIcon';
import Text from './Text';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Variant = 'primary' | 'secondary' | 'ghost' | 'google' | 'apple';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
  icon?: AppIconName;
  iconColor?: string;
  fullWidth?: boolean;
  size?: 'lg' | 'md';
  style?: StyleProp<ViewStyle>;
}

/** The multicolor Google "G" used on the auth buttons (spec 18px glyph). */
function GoogleGlyph({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 18 18">
      <Path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.78 8.78 0 0 0 2.68-6.62Z"
      />
      <Path
        fill="#34A853"
        d="M9 18a8.6 8.6 0 0 0 5.96-2.18l-2.92-2.26a5.4 5.4 0 0 1-8.09-2.85H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <Path
        fill="#FBBC05"
        d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.96l2.99 2.33A5.36 5.36 0 0 1 9 3.58Z"
      />
    </Svg>
  );
}

/** Official Apple logo mark for the "Continue with Apple" button (Guideline 4.8). */
function AppleGlyph({ size = 18, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.15-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.73-1.05-2.76-4.16zM14.47 4.5c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-.98 3.19 1.15.09 2.24-.59 2.93-1.46z"
      />
    </Svg>
  );
}

/**
 * Primary action button (spec F4). Scarlet fill by default with a press-scale
 * (0.97) + carmine-deep pressed color. `secondary`/`ghost`/`google` variants
 * cover the rest. Loading shows a spinner beside the label — never a bare
 * spinner replacing the text.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled = false,
  icon,
  iconColor,
  fullWidth = true,
  size = 'lg',
  style,
}: ButtonProps) {
  const { colors, isDark } = useTheme();
  const scale = useSharedValue(1);
  const pressed = useSharedValue(0);
  const isDisabled = disabled || loading;

  const height = size === 'lg' ? 54 : 48;

  const animStyle = useAnimatedStyle(
    () => ({ transform: [{ scale: scale.value }] }),
    [scale],
  );

  const bgStyle = useAnimatedStyle(() => {
    if (variant !== 'primary') return {};
    return {
      backgroundColor:
        pressed.value === 1 ? colors.carmineDeep : colors.scarlet,
    };
  }, [pressed, colors]);

  const onPressIn = () => {
    scale.value = withTiming(0.97, { duration: 100 });
    pressed.value = 1;
  };
  const onPressOut = () => {
    scale.value = withTiming(1, { duration: 120 });
    pressed.value = 0;
  };

  // Resolve per-variant colors
  let bg = 'transparent';
  let labelColor = colors.onPrimary;
  let borderWidth = 0;
  let borderColor = 'transparent';
  if (variant === 'primary') {
    bg = colors.scarlet;
    labelColor = colors.onPrimary;
  } else if (variant === 'secondary' || variant === 'google') {
    bg = colors.card;
    labelColor = colors.ink;
    borderWidth = 1.5;
    borderColor = colors.borderInput;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    labelColor = colors.scarlet;
  } else if (variant === 'apple') {
    // Apple HIG: black button on light backgrounds, white button on dark ones.
    bg = isDark ? '#FFFFFF' : '#000000';
    labelColor = isDark ? '#000000' : '#FFFFFF';
  }
  if (isDisabled && variant === 'primary') {
    bg = colors.track;
    labelColor = colors.textDisabled;
  }

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        {
          height,
          borderRadius: Radius.button,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingHorizontal: 18,
          backgroundColor: bg,
          borderWidth,
          borderColor,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled && variant !== 'primary' ? 0.5 : 1,
        },
        animStyle,
        variant === 'primary' && !isDisabled ? bgStyle : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'primary' || variant === 'apple'
              ? labelColor
              : colors.textSecondary
          }
        />
      ) : variant === 'google' ? (
        <GoogleGlyph />
      ) : variant === 'apple' ? (
        <AppleGlyph color={labelColor} />
      ) : icon ? (
        <AppIcon name={icon} size={19} color={iconColor ?? labelColor} />
      ) : null}
      <Text
        variant={size === 'lg' ? 'button' : 'buttonSm'}
        color={labelColor}
        numberOfLines={1}
      >
        {loading ? loadingLabel ?? label : label}
      </Text>
    </AnimatedPressable>
  );
}

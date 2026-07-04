import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Radius, Spacing, useTheme } from '../../theme';
import Text from './Text';
import IconButton from './IconButton';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  showHandle?: boolean;
  showClose?: boolean;
  scrollable?: boolean;
}

/**
 * Bottom sheet (spec §3): full-screen scrim (fade in) + sheet surface that
 * rises with a spring. Tap-scrim to close. Handles its own exit animation so
 * the sheet slides back down before unmounting.
 */
export default function Sheet({
  visible,
  onClose,
  children,
  title,
  showHandle = true,
  showClose = false,
  scrollable = false,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, {
        duration: 300,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      });
    } else if (mounted) {
      progress.value = withTiming(
        0,
        { duration: 220, easing: Easing.bezier(0.4, 0, 1, 1) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible]);

  const scrimStyle = useAnimatedStyle(
    () => ({ opacity: progress.value }),
    [progress],
  );
  const sheetStyle = useAnimatedStyle(
    () => ({ transform: [{ translateY: (1 - progress.value) * 40 }], opacity: progress.value }),
    [progress],
  );

  if (!mounted) return null;

  const Body = (
    <View style={{ paddingBottom: insets.bottom + Spacing.lg }}>
      {(showHandle || title || showClose) && (
        <View style={{ paddingTop: 10 }}>
          {showHandle && (
            <View
              style={{
                width: 40,
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.grabber,
                alignSelf: 'center',
              }}
            />
          )}
          {(title || showClose) && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: Spacing.lg,
                marginTop: 12,
              }}
            >
              {title ? (
                <Text variant="section" color={colors.ink} style={{ flex: 1 }}>
                  {title}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {showClose && (
                <IconButton
                  icon="close"
                  onPress={onClose}
                  size={36}
                  iconSize={18}
                  border={false}
                  bg={colors.track}
                  accessibilityLabel="Close"
                />
              )}
            </View>
          )}
        </View>
      )}
      {children}
    </View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <AnimatedPressableScrim
          onPress={onClose}
          color={colors.dim}
          style={scrimStyle}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: colors.sheet,
              borderTopLeftRadius: Radius.sheet,
              borderTopRightRadius: Radius.sheet,
              maxHeight: '90%',
              shadowColor: '#171A1F',
              shadowOpacity: 0.22,
              shadowRadius: 40,
              shadowOffset: { width: 0, height: -12 },
              elevation: 24,
            },
            sheetStyle,
          ]}
        >
          {scrollable ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {Body}
            </ScrollView>
          ) : (
            Body
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function AnimatedPressableScrim({
  onPress,
  color,
  style,
}: {
  onPress: () => void;
  color: string;
  style: any;
}) {
  return (
    <AnimatedPressable
      onPress={onPress}
      style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]}
    />
  );
}

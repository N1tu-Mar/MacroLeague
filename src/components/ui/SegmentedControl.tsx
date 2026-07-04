import React from 'react';
import { View, Pressable, StyleProp, ViewStyle } from 'react-native';
import { Radius, useTheme } from '../../theme';
import Text from './Text';

interface SegmentedControlProps {
  segments: string[];
  value: number;
  onChange: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Segmented control (spec F4). Track bg with a white active thumb that carries
 * a soft shadow. Used for League duration and Log describe/manual toggle.
 */
export default function SegmentedControl({
  segments,
  value,
  onChange,
  style,
}: SegmentedControlProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          backgroundColor: colors.track,
          borderRadius: 12,
          padding: 3,
        },
        style,
      ]}
    >
      {segments.map((label, i) => {
        const active = i === value;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(i)}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: 9,
              alignItems: 'center',
              backgroundColor: active ? colors.card : 'transparent',
              ...(active
                ? {
                    shadowColor: colors.ink,
                    shadowOpacity: 0.1,
                    shadowRadius: 3,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 1,
                  }
                : {}),
            }}
          >
            <Text
              variant="cardTitle"
              color={active ? colors.ink : colors.textSecondary}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

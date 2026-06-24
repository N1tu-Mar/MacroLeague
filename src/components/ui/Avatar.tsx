import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, FontFamily, alpha } from '../../theme';

interface AvatarProps {
  name: string;
  uri?: string | null;
  size?: number;
  /** Optional ring color (e.g. brand for current user, gold for 1st). */
  ring?: string;
}

/** Circular avatar: photo if provided, otherwise the name's first initial. */
export default function Avatar({ name, uri, size = 40, ring }: AvatarProps) {
  const radius = size / 2;
  const ringStyle = ring ? { borderWidth: 2, borderColor: ring } : null;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius, backgroundColor: alpha(Colors.primary, 0.16) },
        ringStyle,
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />
      ) : (
        <Text style={[styles.initial, { fontSize: size * 0.42 }]}>
          {(name?.trim()?.[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontFamily: FontFamily.displayBold,
    color: Colors.textPrimary,
  },
});

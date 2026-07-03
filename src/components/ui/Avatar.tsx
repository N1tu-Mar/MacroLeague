import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Colors, FontFamily, alpha } from '../../theme';

interface AvatarProps {
  name: string;
  uri?: string | null;
  /** Alias for `uri`; several call sites pass the profile field as `url`. */
  url?: string | null;
  size?: number;
  /** Optional ring color (e.g. brand for current user, gold for 1st). */
  ring?: string;
}

/** Circular avatar: photo if provided, otherwise the name's first initial. Only
 *  https images render; anything else falls back to the initial so a hostile
 *  avatar_url can't turn viewers into clients of an arbitrary/cleartext host. */
export default function Avatar({ name, uri, url, size = 40, ring }: AvatarProps) {
  const radius = size / 2;
  const ringStyle = ring ? { borderWidth: 2, borderColor: ring } : null;
  const src = uri ?? url ?? null;
  const safeUri = src && /^https:\/\//i.test(src) ? src : null;

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius, backgroundColor: alpha(Colors.primary, 0.16) },
        ringStyle,
      ]}
    >
      {safeUri ? (
        <Image source={{ uri: safeUri }} style={{ width: size, height: size, borderRadius: radius }} />
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

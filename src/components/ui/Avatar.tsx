import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { FontFamily, useTheme } from '../../theme';

interface AvatarProps {
  name: string;
  uri?: string | null;
  /** Alias for `uri`; several call sites pass the profile field as `url`. */
  url?: string | null;
  size?: number;
  /** Optional ring color (e.g. brand for current user, gold for 1st). */
  ring?: string;
  ringWidth?: number;
  /** Optional background tint for the initial fallback (per-person identity). */
  bg?: string;
}

// Deterministic warm/cool tints so each person keeps a stable avatar color even
// without a photo (mirrors the design's per-person DiceBear background tints).
const TINTS = ['#F3DBC9', '#D8E4F2', '#E4D8F0', '#F0D8DC', '#D8E8EA', '#D5E8DC', '#EAE4D0', '#F2E3D0'];
function tintFor(name: string) {
  let h = 0;
  for (let i = 0; i < (name?.length ?? 0); i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return TINTS[Math.abs(h) % TINTS.length];
}

/** Circular avatar: photo if a safe https URL is provided, else the name's
 *  first initial on a per-person tint. Only https images render. */
export default function Avatar({
  name,
  uri,
  url,
  size = 40,
  ring,
  ringWidth = 2,
  bg,
}: AvatarProps) {
  const { colors } = useTheme();
  const radius = size / 2;
  const ringStyle = ring ? { borderWidth: ringWidth, borderColor: ring } : null;
  const src = uri ?? url ?? null;
  const safeUri = src && /^https:\/\//i.test(src) ? src : null;
  const tint = bg ?? tintFor(name ?? '?');

  return (
    <View
      style={[
        styles.base,
        { width: size, height: size, borderRadius: radius, backgroundColor: tint },
        ringStyle,
      ]}
    >
      {safeUri ? (
        <Image
          source={{ uri: safeUri }}
          style={{ width: size, height: size, borderRadius: radius }}
        />
      ) : (
        <Text
          style={{
            fontFamily: FontFamily.bold,
            fontSize: size * 0.42,
            color: colors.ink,
          }}
        >
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
});

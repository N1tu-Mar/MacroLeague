import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, FontFamily, FontSize, Spacing } from '../theme';
import ProgressBar from './ui/ProgressBar';

interface MacroProgressBarProps {
  label: string;
  current: number;
  target: number;
  unit?: string;
  /** Override the fill color; defaults to brand, turns green when goal is met. */
  color?: string;
  /** Show a small "Not available / partial" hint instead of the value. */
  note?: string;
}

/**
 * One labeled macro/goal progress row: label + value on top, fill bar below.
 * Color flips to success green once the goal is reached, and to a soft warning
 * if the target is exceeded (e.g. over calories), so the bar carries meaning.
 */
export default function MacroProgressBar({
  label,
  current,
  target,
  unit = 'g',
  color,
  note,
}: MacroProgressBarProps) {
  const ratio = target > 0 ? current / target : 0;
  const met = ratio >= 1;
  const fillColor = color ?? (met ? Colors.success : Colors.primary);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {note ? (
          <Text style={styles.note}>{note}</Text>
        ) : (
          <Text style={styles.value}>
            <Text style={[styles.current, met && { color: Colors.success }]}>{Math.round(current)}</Text>
            <Text style={styles.target}> / {Math.round(target)}{unit}</Text>
          </Text>
        )}
      </View>
      <ProgressBar progress={ratio} color={fillColor} height={9} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Spacing.base },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: Spacing.sm,
  },
  label: {
    fontFamily: FontFamily.bodySemiBold,
    fontSize: FontSize.label,
    color: Colors.textPrimary,
  },
  value: { fontFamily: FontFamily.body },
  current: { fontFamily: FontFamily.displayBold, fontSize: FontSize.body, color: Colors.textPrimary },
  target: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary },
  note: { fontFamily: FontFamily.body, fontSize: FontSize.meta, color: Colors.textTertiary },
});

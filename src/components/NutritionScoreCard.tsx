import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors, FontFamily, FontSize, Spacing, Motion, alpha } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface NutritionScoreCardProps {
  score: number;          // 0..100
  delta: number;          // change vs yesterday
  status: string;         // e.g. "Strong day"
  size?: number;
}

// Philippine silver — used here instead of green for a strong (high) score, to
// fit the grayscale + red identity (silver reads as "premium" rather than "go").
const PHILIPPINE_SILVER = '#B3B3B3';

/** Maps a 0–100 score to a meaningful color band. */
function scoreColor(score: number): string {
  if (score >= 80) return PHILIPPINE_SILVER;
  if (score >= 60) return Colors.primary;
  if (score >= 40) return Colors.accent;
  return Colors.error;
}

/**
 * The Today hero: a large radial nutrition score with a count-up reveal and an
 * arc that fills to the score. Delta + status give instant "how am I doing?"
 * context. Count-up is JS-driven (RN can't animate Text content directly); the
 * arc fill uses reanimated.
 */
export default function NutritionScoreCard({ score, delta, status, size = 132 }: NutritionScoreCardProps) {
  const strokeWidth = 11;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, score / 100));
  const color = scoreColor(score);

  // Count-up reveal 0 -> score.
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / Motion.countUp);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(eased * score));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [score]);

  // Arc fill.
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(ratio, {
      duration: Motion.countUp,
      easing: Easing.out(Easing.cubic),
    });
  }, [ratio]);
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const deltaUp = delta >= 0;

  return (
    <View style={styles.container}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={Colors.track}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            animatedProps={animatedProps}
            strokeLinecap="round"
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.score, { color }]}>{display}</Text>
          <Text style={styles.scoreMax}>/ 100</Text>
        </View>
      </View>

      <View style={styles.meta}>
        <Text style={styles.label}>Nutrition Score</Text>
        <View style={styles.deltaRow}>
          <View style={[styles.deltaPill, { backgroundColor: alpha(deltaUp ? PHILIPPINE_SILVER : Colors.error, 0.14) }]}>
            <Text style={[styles.deltaText, { color: deltaUp ? PHILIPPINE_SILVER : Colors.error }]}>
              {deltaUp ? '▲' : '▼'} {Math.abs(delta)} today
            </Text>
          </View>
        </View>
        <Text style={[styles.status, { color }]}>{status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  center: { alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: FontFamily.displayBold, fontSize: FontSize.hero, lineHeight: FontSize.hero + 2 },
  scoreMax: { fontFamily: FontFamily.body, fontSize: FontSize.label, color: Colors.textSecondary, marginTop: -4 },
  meta: { flex: 1, gap: Spacing.sm },
  label: {
    fontFamily: FontFamily.displayBold,
    fontSize: FontSize.label,
    color: Colors.textSecondary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  deltaRow: { flexDirection: 'row' },
  deltaPill: { paddingHorizontal: Spacing.md, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  deltaText: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.label },
  status: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.subhead },
});

import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { FontFamily, Type, useTheme } from '../theme';
import { Text, Button, ProgressBar, AppIcon } from './ui';

interface MacroLine {
  now: number;
  goal: number;
}

interface NutritionHeroProps {
  /** null renders the new-user em-dash placeholder. */
  score: number | null;
  delta: number;
  statusWord: string;
  calories: MacroLine;
  protein: MacroLine;
  carbs: MacroLine;
  recommendText?: string | null;
  onLog: () => void;
  isNew?: boolean;
}

/** Animated count-up for the hero score (spec: 400ms on load). */
function useCountUp(target: number | null) {
  const [value, setValue] = useState(target ?? 0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const from = 0;
    const start = Date.now();
    const dur = 400;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target]);
  return value;
}

export default function NutritionHero({
  score,
  delta,
  statusWord,
  calories,
  protein,
  carbs,
  recommendText,
  onLog,
  isNew = false,
}: NutritionHeroProps) {
  const { colors } = useTheme();
  const shown = useCountUp(isNew ? null : score);

  const heroCard = {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#171A1F',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  } as const;

  if (isNew) {
    return (
      <View style={[heroCard, { alignItems: 'center', paddingVertical: 22 }]}>
        <Text variant="overline" color={colors.textSecondary}>Nutrition Score</Text>
        <Text style={[Type.scoreHero, { color: colors.switchOff, marginTop: 6 }]}>—</Text>
        <Text variant="subhead" color={colors.ink} style={{ marginTop: 10, textAlign: 'center' }}>
          Log your first meal to start today's score.
        </Text>
        <Text variant="label" color={colors.textSecondary} center style={{ marginTop: 6 }}>
          Confirmed meals earn{' '}
          <Text variant="label" color={colors.success} style={{ fontFamily: FontFamily.bold }}>50 XP</Text> and{' '}
          <Text variant="label" color={colors.scarlet} style={{ fontFamily: FontFamily.bold }}>10 League Points</Text>.
        </Text>
        <Button label="Log meal" icon="plus" onPress={onLog} style={{ marginTop: 16, alignSelf: 'stretch' }} />
      </View>
    );
  }

  const line = (label: string, m: MacroLine, color: string, height: number) => {
    const over = m.goal > 0 && m.now > m.goal;
    return (
      <View style={{ marginTop: 9 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text variant="label" color={colors.textSecondary}>{label}</Text>
          <Text variant="label" color={colors.textSecondary}>
            <Text variant="label" color={over ? colors.error : colors.ink} style={{ fontFamily: FontFamily.semibold }}>
              {Math.round(m.now)}
            </Text>{' '}
            / {Math.round(m.goal)}g
          </Text>
        </View>
        <ProgressBar
          progress={m.goal > 0 ? m.now / m.goal : 0}
          color={color}
          height={height}
          style={{ marginTop: 5 }}
        />
      </View>
    );
  };

  const calOver = calories.goal > 0 && calories.now > calories.goal;

  return (
    <View style={heroCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View>
          <Text variant="overline" color={colors.textSecondary}>Nutrition Score</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <Text style={[Type.scoreHero, { color: colors.ink }]}>{shown}</Text>
            <Text style={{ fontFamily: FontFamily.numSemibold, fontSize: 20, color: colors.textTertiary }}>/100</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: colors.successTint, borderRadius: 99, paddingVertical: 5, paddingHorizontal: 11 }}>
            <Text color={colors.successDeep} style={{ fontFamily: FontFamily.semibold, fontSize: 12.5 }}>{statusWord}</Text>
          </View>
          {delta !== 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 }}>
              <AppIcon name={delta > 0 ? 'arrow-up' : 'arrow-down'} size={13} color={delta > 0 ? colors.success : colors.error} />
              <Text color={delta > 0 ? colors.success : colors.error} style={{ fontFamily: FontFamily.semibold, fontSize: 12.5 }}>
                {delta > 0 ? 'Up' : 'Down'} {Math.abs(delta)} from yesterday
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Calories */}
      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text variant="subhead" color={colors.ink}>Calories</Text>
          <Text style={{ fontFamily: FontFamily.numBold, fontSize: 16, color: calOver ? colors.error : colors.ink }}>
            {Math.round(calories.now).toLocaleString()}{' '}
            <Text style={{ fontFamily: FontFamily.numSemibold, color: colors.textTertiary }}>
              / {Math.round(calories.goal).toLocaleString()} kcal
            </Text>
          </Text>
        </View>
        <ProgressBar
          progress={calories.goal > 0 ? calories.now / calories.goal : 0}
          color={colors.ink}
          height={12}
          style={{ marginTop: 7 }}
        />
      </View>

      {line('Protein', protein, colors.scarlet, 6)}
      {line('Carbs', carbs, colors.macroCarb, 6)}

      {recommendText ? (
        <View
          style={{
            marginTop: 14,
            backgroundColor: colors.brandTint,
            borderRadius: 12,
            padding: 10,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 9,
          }}
        >
          <AppIcon name="target" size={16} color={colors.errorDeep} />
          <Text variant="label" color={colors.errorMuted} style={{ flex: 1 }}>{recommendText}</Text>
        </View>
      ) : null}

      <Button label="Log meal" icon="plus" onPress={onLog} size="md" style={{ marginTop: 12 }} />
    </View>
  );
}

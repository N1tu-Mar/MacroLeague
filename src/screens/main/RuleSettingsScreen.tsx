import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../../theme';
import {
  Screen,
  ScreenHeader,
  Text,
  Card,
  Button,
  Switch,
  Divider,
} from '../../components/ui';
import { useUserStore } from '../../store/userStore';
import {
  getActiveRuleSet,
  saveRuleModules,
  RuleModules,
} from '../../services/ruleSetService';
import { toUserFacingMessage } from '../../lib/errors';

/**
 * Individual rule-settings surface. Lets a user enable/disable the scoring
 * modules the award engine evaluates (migration 0006). Saving creates/updates the
 * user's OWN rule set, which the trigger then prefers over the system default, so
 * each module can be tested independently before leagues exist.
 */
export default function RuleSettingsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const userId = useUserStore((s) => s.user?.id);
  const [modules, setModules] = useState<RuleModules | null>(null);
  const [isOwn, setIsOwn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) return;
      try {
        const ruleSet = await getActiveRuleSet(userId);
        if (active) {
          setModules(ruleSet.modules);
          setIsOwn(ruleSet.isOwn);
        }
      } catch (caughtError) {
        if (active) {
          Alert.alert(
            'Could not load rules',
            toUserFacingMessage(caughtError, 'Please try again.'),
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  function patch(next: Partial<RuleModules>) {
    setModules((current) => (current ? { ...current, ...next } : current));
  }

  async function save() {
    if (!userId || !modules) return;
    setIsSaving(true);
    try {
      await saveRuleModules(userId, modules);
      setIsOwn(true);
      Alert.alert('Saved', 'Your scoring rules have been updated.');
      navigation.goBack();
    } catch (caughtError) {
      Alert.alert(
        'Could not save',
        toUserFacingMessage(caughtError, 'Please try again.'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !modules) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.scarlet} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <ScreenHeader title="Scoring rules" onBack={() => navigation.goBack()} />

      <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4, marginBottom: 18 }}>
        Choose which goals earn points and leaderboard score.
        {isOwn ? ' Using your custom rules.' : ' Using the default rules.'}
      </Text>

      <Card padded={false} style={{ marginBottom: 14 }}>
        <RuleRow
          label="Meal count goal"
          sub={`Reward logging ${modules.mealCountRequired} meals in a day`}
          value={modules.mealCountEnabled}
          onChange={(v) => patch({ mealCountEnabled: v })}
        />
        <Divider inset={16} />
        <RuleRow
          label="Daily protein goal"
          sub={`Reward reaching ${modules.proteinMinPct}% of your protein goal`}
          value={modules.proteinGoalEnabled}
          onChange={(v) => patch({ proteinGoalEnabled: v })}
        />
        <Divider inset={16} />
        <RuleRow
          label="Macro accuracy"
          sub="Reward calories, protein & carbs within target bands"
          value={modules.macroAccuracyEnabled}
          onChange={(v) => patch({ macroAccuracyEnabled: v })}
        />
        <Divider inset={16} />
        <RuleRow
          label="Streak milestones"
          sub="Reward 7 / 14 / 21 / 30-day logging streaks"
          value={modules.streakEnabled}
          onChange={(v) => patch({ streakEnabled: v })}
        />
      </Card>

      <Text variant="body" color={colors.textTertiary} style={{ marginBottom: 24, fontSize: 12 }}>
        Base meal XP and points are always awarded. Changes apply to meals you log
        from now on.
      </Text>

      <Button
        label="Save rules"
        onPress={save}
        loading={isSaving}
        loadingLabel="Saving…"
      />
    </Screen>
  );
}

function RuleRow({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text variant="subhead" color={colors.ink}>
          {label}
        </Text>
        <Text variant="label" color={colors.textSecondary} style={{ marginTop: 2 }}>
          {sub}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

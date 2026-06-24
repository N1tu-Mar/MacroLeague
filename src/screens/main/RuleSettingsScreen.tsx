import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, FontFamily } from '../../theme';
import { useUserStore } from '../../store/userStore';
import {
  getActiveRuleSet,
  saveRuleModules,
  RuleModules,
} from '../../services/ruleSetService';

/**
 * Individual rule-settings surface. Lets a user enable/disable the scoring
 * modules the award engine evaluates (migration 0006). Saving creates/updates the
 * user's OWN rule set, which the trigger then prefers over the system default, so
 * each module can be tested independently before leagues exist.
 */
export default function RuleSettingsScreen({ navigation }: any) {
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
            caughtError instanceof Error ? caughtError.message : 'Please try again.',
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
        caughtError instanceof Error ? caughtError.message : 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !modules) {
    return (
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>SCORING RULES</Text>
      <Text style={styles.subtitle}>
        Choose which goals earn points and leaderboard score.
        {isOwn ? ' Using your custom rules.' : ' Using the default rules.'}
      </Text>

      <RuleRow
        label="Meal count goal"
        sub={`Reward logging ${modules.mealCountRequired} meals in a day`}
        value={modules.mealCountEnabled}
        onChange={(v) => patch({ mealCountEnabled: v })}
      />
      <RuleRow
        label="Daily protein goal"
        sub={`Reward reaching ${modules.proteinMinPct}% of your protein goal`}
        value={modules.proteinGoalEnabled}
        onChange={(v) => patch({ proteinGoalEnabled: v })}
      />
      <RuleRow
        label="Macro accuracy"
        sub="Reward calories, protein & carbs within target bands"
        value={modules.macroAccuracyEnabled}
        onChange={(v) => patch({ macroAccuracyEnabled: v })}
      />
      <RuleRow
        label="Streak milestones"
        sub="Reward 7 / 14 / 21 / 30-day logging streaks"
        value={modules.streakEnabled}
        onChange={(v) => patch({ streakEnabled: v })}
      />

      <Text style={styles.note}>
        Base meal XP and points are always awarded. Changes apply to meals you log
        from now on.
      </Text>

      <TouchableOpacity
        style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={isSaving}
      >
        <Text style={styles.saveBtnText}>{isSaving ? 'SAVING...' : 'SAVE RULES'}</Text>
      </TouchableOpacity>
    </ScrollView>
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
  return (
    <View style={styles.ruleRow}>
      <View style={{ flex: 1, marginRight: 12 }}>
        <Text style={styles.ruleLabel}>{label}</Text>
        <Text style={styles.ruleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: Colors.surface2, true: Colors.primary + '88' }}
        thumbColor={value ? Colors.primary : Colors.textSecondary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingTop: 60 },
  backBtn: { marginBottom: 16 },
  backText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.primary },
  title: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: 1, marginBottom: 4 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
  },
  ruleLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: 15, color: Colors.textPrimary },
  ruleSub: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  note: {
    fontFamily: FontFamily.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 8,
    marginBottom: 20,
    lineHeight: 17,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
});

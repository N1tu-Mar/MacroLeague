import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { Colors, FontFamily } from '../../theme';
import AppIcon from '../../components/ui/AppIcon';

export default function NotificationsSettingsScreen({ navigation }: any) {
  const [streakReminder, setStreakReminder] = useState(true);
  const [challengeUpdates, setChallengeUpdates] = useState(true);
  const [teamAlerts, setTeamAlerts] = useState(true);
  const [goalReminders, setGoalReminders] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState(true);

  const settings = [
    { label: 'Streak Reminders', desc: 'Daily reminder to keep your streak alive', value: streakReminder, onChange: setStreakReminder },
    { label: 'Challenge Updates', desc: 'Score changes and challenge endings', value: challengeUpdates, onChange: setChallengeUpdates },
    { label: 'Team Alerts', desc: 'When teammates log meals or hit goals', value: teamAlerts, onChange: setTeamAlerts },
    { label: 'Goal Reminders', desc: 'Nudge when you\'re behind on daily macros', value: goalReminders, onChange: setGoalReminders },
    { label: 'Weekly Report', desc: 'Summary of your weekly progress', value: weeklyReport, onChange: setWeeklyReport },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <AppIcon name="back" size={17} color={Colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>NOTIFICATIONS</Text>
      <Text style={styles.subtitle}>Choose what alerts you want to receive</Text>

      {settings.map((s) => (
        <View key={s.label} style={styles.row}>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>{s.label}</Text>
            <Text style={styles.rowDesc}>{s.desc}</Text>
          </View>
          <Switch
            value={s.value}
            onValueChange={s.onChange}
            trackColor={{ false: Colors.surface2, true: Colors.primary + '44' }}
            thumbColor={s.value ? Colors.primary : Colors.textSecondary}
          />
        </View>
      ))}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Notification permissions must be enabled in your device settings for alerts to work.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.primary },
  title: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: 1, marginBottom: 4 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 8,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  rowLabel: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.textPrimary },
  rowDesc: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  note: {
    backgroundColor: Colors.surface2,
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  noteText: { fontFamily: FontFamily.body, fontSize: 12, color: Colors.textSecondary, textAlign: 'center' },
});

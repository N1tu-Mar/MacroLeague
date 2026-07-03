import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, FontFamily } from '../../theme';
import AppIcon from '../../components/ui/AppIcon';
import { useUserStore } from '../../store/userStore';

type NotificationPreferences = {
  streakReminder: boolean;
  challengeUpdates: boolean;
  teamAlerts: boolean;
  goalReminders: boolean;
  weeklyReport: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  streakReminder: true,
  challengeUpdates: true,
  teamAlerts: true,
  goalReminders: false,
  weeklyReport: true,
};

export default function NotificationsSettingsScreen({ navigation }: any) {
  const userId = useUserStore((s) => s.user?.id ?? 'anonymous');
  const storageKey = `ml_notification_preferences:${userId}`;
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setPreferences(DEFAULT_PREFERENCES);
    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
        const safe = Object.fromEntries(
          Object.entries(parsed).filter(([, value]) => typeof value === 'boolean'),
        ) as Partial<NotificationPreferences>;
        setPreferences({ ...DEFAULT_PREFERENCES, ...safe });
      })
      .catch(() => {
        // Keep defaults if local preferences are absent or malformed.
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [storageKey]);

  function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    setPreferences((current) => {
      const next = { ...current, [key]: value };
      void AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {
        // The switch still works for this session if local storage is unavailable.
      });
      return next;
    });
  }

  const settings = [
    { key: 'streakReminder' as const, label: 'Streak Reminders', desc: 'Daily reminder to keep your streak alive' },
    { key: 'challengeUpdates' as const, label: 'Challenge Updates', desc: 'Score changes and challenge endings' },
    { key: 'teamAlerts' as const, label: 'Team Alerts', desc: 'When teammates log meals or hit goals' },
    { key: 'goalReminders' as const, label: 'Goal Reminders', desc: 'Nudge when you\'re behind on daily macros' },
    { key: 'weeklyReport' as const, label: 'Weekly Report', desc: 'Summary of your weekly progress' },
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
            value={preferences[s.key]}
            onValueChange={(value) => updatePreference(s.key, value)}
            disabled={!loaded}
            trackColor={{ false: Colors.surface2, true: Colors.primary + '44' }}
            thumbColor={preferences[s.key] ? Colors.primary : Colors.textSecondary}
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

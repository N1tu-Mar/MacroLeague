import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../theme';
import {
  Screen,
  ScreenHeader,
  Text,
  Card,
  Switch,
  Divider,
} from '../../components/ui';
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
  const { colors } = useTheme();
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
    { key: 'streakReminder' as const, label: 'Streak reminders', desc: 'One evening nudge if the day\'s streak is unsecured' },
    { key: 'challengeUpdates' as const, label: 'Challenge updates', desc: 'Rank changes and final results in your challenges' },
    { key: 'teamAlerts' as const, label: 'Friend alerts', desc: 'Requests, and when a rival passes you' },
    { key: 'goalReminders' as const, label: 'Goal reminders', desc: 'A mid-afternoon check-in on remaining targets' },
    { key: 'weeklyReport' as const, label: 'Weekly report', desc: 'Sunday summary of scores, streak, and rank' },
  ];

  return (
    <Screen scroll>
      <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />

      <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4, marginBottom: 18 }}>
        Choose what alerts you want to receive.
      </Text>

      <Card padded={false} style={{ marginBottom: 16 }}>
        {settings.map((s, i) => (
          <View key={s.key}>
            {i > 0 && <Divider inset={16} />}
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
                  {s.label}
                </Text>
                <Text variant="label" color={colors.textSecondary} style={{ marginTop: 2 }}>
                  {s.desc}
                </Text>
              </View>
              <Switch
                value={preferences[s.key]}
                onValueChange={(value) => updatePreference(s.key, value)}
                disabled={!loaded}
              />
            </View>
          </View>
        ))}
      </Card>

      <Text variant="label" color={colors.textTertiary} center>
        Notification permissions must be enabled in your device settings for alerts to work.
      </Text>
    </Screen>
  );
}

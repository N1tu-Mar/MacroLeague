// Notification settings — real, server-side preferences.
//
// This screen used to write five switches to AsyncStorage and nothing else: no
// permission request, no device token, no sender. Every switch was decorative.
// It now reads and writes notification_preferences (migration 0023) through
// SECURITY DEFINER RPCs, because a device-local preference could never actually
// stop a push — the thing that reads preferences is the `send-notifications`
// edge function, which has no access to a phone's local storage.
//
// Three states are surfaced honestly rather than hidden:
//   * loading / error on the preference read (with a retry),
//   * OS permission denied — the switches are useless until the user turns
//     notifications on in system settings, so we say so and link there,
//   * push unavailable (simulator, web, no EAS project id) — the preferences
//     still save, they just cannot be delivered to this device.
//
// Optimistic writes with rollback: a switch flips immediately, and snaps back
// with an inline error if the server rejects it. A settings toggle that lags a
// network round trip feels broken.
import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, AppState } from 'react-native';
import { useTheme } from '../../theme';
import {
  Screen,
  ScreenHeader,
  Text,
  Card,
  Switch,
  Divider,
  Button,
} from '../../components/ui';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '../../lib/pushNotifications';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  getPermissionState,
  requestPermission,
  registerForPushNotifications,
  openSystemSettings,
  pushSupported,
  type PermissionState,
} from '../../services/notificationService';
import { toUserFacingMessage } from '../../lib/errors';

const SETTINGS: {
  key: keyof NotificationPreferences;
  label: string;
  desc: string;
}[] = [
  {
    key: 'streak_reminders',
    label: 'Streak reminders',
    desc: "One 7pm nudge, your time, if the day's streak is unsecured",
  },
  {
    key: 'challenge_updates',
    label: 'Challenge updates',
    desc: 'A heads-up when a challenge you are in is about to end',
  },
  {
    key: 'friend_activity',
    label: 'Friend alerts',
    desc: 'Requests, and when a rival passes you',
  },
  {
    key: 'rewards',
    label: 'Rewards',
    desc: 'When you have enough points to redeem something',
  },
  {
    key: 'weekly_report',
    label: 'Weekly report',
    desc: 'Sunday summary of scores, streak, and rank',
  },
];

export default function NotificationsSettingsScreen({ navigation }: any) {
  const { colors } = useTheme();

  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<PermissionState>('unavailable');
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [prefs, state] = await Promise.all([
        fetchNotificationPreferences(),
        getPermissionState(),
      ]);
      setPreferences(prefs);
      setPermission(state);
    } catch (error) {
      setLoadError(
        toUserFacingMessage(error, 'Could not load your notification settings.'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-check permission when the app comes back to the foreground: the user may
  // have just changed it in system settings, and the screen must not keep
  // showing "notifications are off" after they turned them on.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void getPermissionState().then(async (next) => {
        setPermission(next);
        // Newly granted from settings: pick up the token now, don't wait for the
        // next sign-in.
        if (next === 'granted') await registerForPushNotifications();
      });
    });
    return () => sub.remove();
  }, []);

  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    const previous = preferences;
    setPreferences({ ...previous, [key]: value });
    setSaveError(null);
    setSaving(true);
    try {
      const saved = await updateNotificationPreferences({ [key]: value });
      setPreferences(saved);
      // Turning something ON is the natural moment to ask for permission — the
      // intent is explicit, which is exactly when a prompt converts.
      if (value && permission === 'undetermined') {
        setPermission(await requestPermission());
        await registerForPushNotifications();
      }
    } catch (error) {
      // Roll back so the switch never shows a state the server does not hold.
      setPreferences(previous);
      setSaveError(
        toUserFacingMessage(error, 'Could not save that. Please try again.'),
      );
    } finally {
      setSaving(false);
    }
  }

  async function onEnablePress() {
    setRequesting(true);
    try {
      const next = await requestPermission();
      setPermission(next);
      if (next === 'granted') await registerForPushNotifications();
      else if (next === 'denied') await openSystemSettings();
    } finally {
      setRequesting(false);
    }
  }

  // `saving` is included so toggles serialize: each updatePreference resolves
  // with a FULL server snapshot and setPreferences(saved) replaces everything.
  // With two writes in flight, the slower (older) response landing last would
  // clobber the newer toggle's value.
  const switchesDisabled = loading || saving || !!loadError;

  return (
    <Screen scroll>
      <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />

      <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4, marginBottom: 18 }}>
        Choose what alerts you want to receive.
      </Text>

      {/* Permission banner. Only shown once the real state is known, so it never
          flashes the wrong message during the initial load. */}
      {!loading && permission === 'denied' && (
        <Card style={{ marginBottom: 16, borderColor: colors.danger, borderWidth: 1 }}>
          <Text variant="subhead" color={colors.danger}>
            Notifications are turned off
          </Text>
          <Text variant="label" color={colors.textSecondary} style={{ marginTop: 4 }}>
            Your choices below are saved, but nothing can reach this device until you allow
            notifications for MacroLeague in your system settings.
          </Text>
          <Button
            label="Open settings"
            variant="secondary"
            size="md"
            onPress={openSystemSettings}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      {!loading && permission === 'undetermined' && (
        <Card style={{ marginBottom: 16 }}>
          <Text variant="subhead" color={colors.ink}>
            Turn on notifications
          </Text>
          <Text variant="label" color={colors.textSecondary} style={{ marginTop: 4 }}>
            Allow notifications so a streak reminder can reach you before the day ends.
          </Text>
          <Button
            label="Allow notifications"
            variant="primary"
            size="md"
            loading={requesting}
            onPress={onEnablePress}
            style={{ marginTop: 12 }}
          />
        </Card>
      )}

      {!loading && permission === 'unavailable' && pushSupported() === false && (
        <Card style={{ marginBottom: 16 }}>
          <Text variant="label" color={colors.textSecondary}>
            Push notifications are not available on this device or build. Your preferences are still
            saved to your account and apply as soon as you sign in on a phone.
          </Text>
        </Card>
      )}

      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.scarlet} />
        </View>
      ) : loadError ? (
        <Card style={{ marginBottom: 16 }}>
          <Text variant="subhead" color={colors.danger}>
            Could not load your settings
          </Text>
          <Text variant="label" color={colors.textSecondary} style={{ marginTop: 4 }}>
            {loadError}
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            size="md"
            onPress={() => void load()}
            style={{ marginTop: 12 }}
          />
        </Card>
      ) : (
        <Card padded={false} style={{ marginBottom: 16 }}>
          {SETTINGS.map((s, i) => (
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
                  onValueChange={(value) => void updatePreference(s.key, value)}
                  disabled={switchesDisabled}
                />
              </View>
            </View>
          ))}
        </Card>
      )}

      {saveError && (
        <Text variant="label" color={colors.danger} center style={{ marginBottom: 12 }}>
          {saveError}
        </Text>
      )}

      <Text variant="label" color={colors.textTertiary} center>
        {saving
          ? 'Saving…'
          : 'Preferences are saved to your account and apply on every device you sign in on.'}
      </Text>
    </Screen>
  );
}

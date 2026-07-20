import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Alert } from 'react-native';
import { useTheme, Radius } from '../../theme';
import {
  Screen,
  ScreenHeader,
  Text,
  Button,
  Card,
  Switch,
  TextField,
  AppIcon,
} from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  getSocialSettings,
  updateSocialHandles,
  updateSharingVisibility,
  type SharingVisibility,
} from '../../services/profileService';
import {
  SOCIAL_PLATFORMS,
  PLATFORM_LABEL,
  HANDLE_RULES,
  normalizeHandle,
  isValidHandle,
  type SocialPlatform,
} from '../../lib/socialHandles';
import { reportError } from '../../lib/monitoring';
import { toUserFacingMessage } from '../../lib/errors';

/**
 * Connect Instagram / Snapchat / TikTok, and control who can see your activity.
 *
 * Handles are stored BARE — never as a URL. normalizeHandle() accepts whatever
 * the user pastes (a full profile link, "@name", or a bare handle) and reduces
 * it to the handle; isValidHandle() then mirrors the DB CHECK constraints from
 * migration 0021, which are the authoritative gate. Storing a user-supplied URL
 * would let one user point every viewer's browser at an arbitrary host.
 *
 * Nothing here is ever public: visibility is 'friends' or 'private' only.
 */

const PLATFORM_ICON: Record<SocialPlatform, 'instagram' | 'snapchat' | 'tiktok'> = {
  instagram: 'instagram',
  snapchat: 'snapchat',
  tiktok: 'tiktok',
};

const PLATFORM_PLACEHOLDER: Record<SocialPlatform, string> = {
  instagram: 'yourhandle',
  snapchat: 'yourhandle',
  tiktok: 'yourhandle',
};

export default function SocialAccountsScreen({ navigation }: any) {
  const { colors } = useTheme();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [handles, setHandles] = useState<Record<SocialPlatform, string>>({
    instagram: '',
    snapchat: '',
    tiktok: '',
  });
  const [errors, setErrors] = useState<Partial<Record<SocialPlatform, string>>>({});
  const [activityVisibility, setActivityVisibility] =
    useState<SharingVisibility>('friends');
  const [linksVisibility, setLinksVisibility] = useState<SharingVisibility>('friends');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('You are not signed in.');

      const settings = await getSocialSettings(data.user.id);
      setHandles({
        instagram: settings.instagram ?? '',
        snapchat: settings.snapchat ?? '',
        tiktok: settings.tiktok ?? '',
      });
      setActivityVisibility(settings.activityVisibility);
      setLinksVisibility(settings.socialLinksVisibility);
    } catch (err) {
      // Show the failure rather than presenting empty fields as if the user had
      // nothing linked — saving from that state would wipe their real handles.
      setLoadError("Couldn't load your linked accounts.");
      reportError(err, { where: 'SocialAccountsScreen.load' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onChangeHandle(platform: SocialPlatform, raw: string) {
    setHandles((prev) => ({ ...prev, [platform]: raw }));
    if (errors[platform]) setErrors((prev) => ({ ...prev, [platform]: undefined }));
  }

  /** Normalize on blur so a pasted URL visibly becomes the handle it will store. */
  function onBlurHandle(platform: SocialPlatform) {
    const normalized = normalizeHandle(handles[platform]);
    setHandles((prev) => ({ ...prev, [platform]: normalized ?? '' }));

    if (normalized && !isValidHandle(platform, normalized)) {
      setErrors((prev) => ({ ...prev, [platform]: HANDLE_RULES[platform] }));
    }
  }

  async function save() {
    // Validate everything before writing anything — a partial save that rejects
    // halfway would leave the screen and the database disagreeing.
    const normalized: Record<SocialPlatform, string | null> = {
      instagram: null,
      snapchat: null,
      tiktok: null,
    };
    const nextErrors: Partial<Record<SocialPlatform, string>> = {};

    for (const platform of SOCIAL_PLATFORMS) {
      const value = normalizeHandle(handles[platform]);
      if (value && !isValidHandle(platform, value)) {
        nextErrors[platform] = HANDLE_RULES[platform];
      }
      normalized[platform] = value;
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error('You are not signed in.');

      await updateSocialHandles(data.user.id, normalized);
      await updateSharingVisibility(data.user.id, {
        activityVisibility,
        socialLinksVisibility: linksVisibility,
      });

      // Reflect exactly what was stored.
      setHandles({
        instagram: normalized.instagram ?? '',
        snapchat: normalized.snapchat ?? '',
        tiktok: normalized.tiktok ?? '',
      });
      Alert.alert('Saved', 'Your linked accounts were updated.');
      navigation.goBack();
    } catch (err) {
      reportError(err, { where: 'SocialAccountsScreen.save' });
      Alert.alert(
        'Could not save',
        toUserFacingMessage(err, 'Please try again.'),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Linked accounts" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.scarlet} size="large" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll bottomSpace={110}>
      <ScreenHeader title="Linked accounts" onBack={() => navigation.goBack()} />

      {loadError ? (
        <Card style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AppIcon name="circle-alert" size={16} color={colors.textSecondary} />
          <Text variant="labelSm" color={colors.textSecondary} style={{ flex: 1 }}>
            {loadError}
          </Text>
          <Button label="Retry" variant="secondary" size="md" onPress={load} />
        </Card>
      ) : null}

      <Text
        variant="labelSm"
        color={colors.textSecondary}
        style={{ marginTop: 12, marginBottom: 12, lineHeight: 18 }}
      >
        Add your handles so friends can find you off MacroLeague. Only accepted
        friends can see these — never the public leaderboard.
      </Text>

      {SOCIAL_PLATFORMS.map((platform) => (
        <Card key={platform} style={{ marginBottom: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AppIcon name={PLATFORM_ICON[platform]} size={16} color={colors.ink} />
            <Text variant="cardTitle" color={colors.ink}>
              {PLATFORM_LABEL[platform]}
            </Text>
          </View>
          <TextField
            value={handles[platform]}
            onChangeText={(text: string) => onChangeHandle(platform, text)}
            onBlur={() => onBlurHandle(platform)}
            placeholder={PLATFORM_PLACEHOLDER[platform]}
            autoCapitalize="none"
            autoCorrect={false}
            error={errors[platform] ?? null}
            accessibilityLabel={`${PLATFORM_LABEL[platform]} handle`}
          />
          {errors[platform] ? null : (
            <Text variant="labelSm" color={colors.textTertiary}>
              Paste your profile link or just your handle.
            </Text>
          )}
        </Card>
      ))}

      <Text
        variant="section"
        color={colors.ink}
        style={{ marginTop: 8, marginBottom: 8, paddingHorizontal: 2 }}
      >
        Privacy
      </Text>

      <Card style={{ gap: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingVertical: 6,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="cardTitle" color={colors.ink}>
              Share my activity
            </Text>
            <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 2 }}>
              Friends see when you log meals, hit goals and win challenges. Your
              meals and macros are never shared.
            </Text>
          </View>
          <Switch
            value={activityVisibility === 'friends'}
            onValueChange={(on: boolean) => setActivityVisibility(on ? 'friends' : 'private')}
            accessibilityLabel="Share my activity with friends"
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: colors.rowDivider,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text variant="cardTitle" color={colors.ink}>
              Share my linked accounts
            </Text>
            <Text variant="labelSm" color={colors.textSecondary} style={{ marginTop: 2 }}>
              Friends can open your Instagram, Snapchat and TikTok from your profile.
            </Text>
          </View>
          <Switch
            value={linksVisibility === 'friends'}
            onValueChange={(on: boolean) => setLinksVisibility(on ? 'friends' : 'private')}
            accessibilityLabel="Share my linked accounts with friends"
          />
        </View>
      </Card>

      <Button
        label={isSaving ? 'Saving…' : 'Save'}
        onPress={save}
        loading={isSaving}
        disabled={isSaving || !!loadError}
        fullWidth
        style={{ marginTop: 20, borderRadius: Radius.card }}
      />
    </Screen>
  );
}

import React, { useMemo, useState } from 'react';
import { View, Pressable, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme';
import { Sheet, Text, Button, Avatar, AppIcon } from './ui';
import { updateProfileAvatar } from '../services/profileService';
import { useUserStore } from '../store/userStore';

// The design's profile pictures are DiceBear "micah" avatars on per-person
// tints. We render the PNG endpoint (not SVG) so the same image works on iOS,
// Android and web via <Image>. Each option is a stable seed + background tint.
const SEEDS = ['Champion', 'Striker', 'Ace', 'Blaze', 'Nova', 'Pilot', 'Scout', 'Ranger', 'Comet'];
const TINTS = ['f3dbc9', 'd8e4f2', 'e4d8f0', 'f0d8dc', 'd8e8ea', 'd5e8dc', 'eae4d0', 'f2e3d0', 'e3e8f2'];

function micahUrl(seed: string, tint: string): string {
  return `https://api.dicebear.com/9.x/micah/png?seed=${encodeURIComponent(seed)}&backgroundColor=${tint}&size=160`;
}

interface AvatarPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  name: string;
  currentUrl?: string | null;
}

/** Lets the user pick (or clear) a profile picture from the design's PFP set. */
export default function AvatarPickerSheet({
  visible,
  onClose,
  userId,
  name,
  currentUrl,
}: AvatarPickerSheetProps) {
  const { colors } = useTheme();
  const setAvatarUrl = useUserStore((s) => s.setAvatarUrl);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      SEEDS.map((seed, i) => {
        const tint = TINTS[i % TINTS.length];
        return { url: micahUrl(`${seed}-${name}`, tint), tint: `#${tint}` };
      }),
    [name],
  );

  async function choose(url: string | null) {
    setSaving(url ?? 'none');
    setError(null);
    try {
      await updateProfileAvatar(userId, url);
      setAvatarUrl(url);
      onClose();
    } catch {
      setError('Could not save your picture. Please try again.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Profile picture" showClose>
      <View style={{ paddingHorizontal: 20, paddingTop: 4, gap: 16 }}>
        <Text variant="label" color={colors.textSecondary}>
          Pick a look for your league profile. You can change it anytime.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14 }}>
          {options.map((opt) => {
            const selected = currentUrl === opt.url;
            const isSaving = saving === opt.url;
            return (
              <Pressable
                key={opt.url}
                onPress={() => choose(opt.url)}
                disabled={!!saving}
                style={{ width: '30%', alignItems: 'center' }}
              >
                <View
                  style={{
                    borderRadius: 99,
                    padding: 3,
                    borderWidth: 2,
                    borderColor: selected ? colors.scarlet : 'transparent',
                  }}
                >
                  <Image
                    source={{ uri: opt.url }}
                    style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: opt.tint }}
                  />
                  {isSaving ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 3,
                        left: 3,
                        right: 3,
                        bottom: 3,
                        borderRadius: 38,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.dim,
                      }}
                    >
                      <ActivityIndicator color="#fff" />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {currentUrl ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.canvas, borderRadius: 14, padding: 12 }}>
            <Avatar name={name} size={40} />
            <Text variant="label" color={colors.textSecondary} style={{ flex: 1 }}>
              Prefer your initials? You can remove your picture.
            </Text>
            <Button label="Remove" variant="secondary" size="md" fullWidth={false} loading={saving === 'none'} onPress={() => choose(null)} style={{ paddingHorizontal: 16 }} />
          </View>
        ) : null}

        {error ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon name="circle-alert" size={14} color={colors.error} />
            <Text variant="label" color={colors.error} style={{ flex: 1 }}>{error}</Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

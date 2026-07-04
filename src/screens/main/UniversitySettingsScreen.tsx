import React, { useEffect, useState } from 'react';
import { View, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useTheme, Radius } from '../../theme';
import {
  Screen,
  ScreenHeader,
  Text,
  Button,
  AppIcon,
} from '../../components/ui';
import { UNIVERSITIES, getDiningHallsForUniversity } from '../../data/universityDining';
import { supabase } from '../../lib/supabase';
import { getProfileIdentity, updateProfileUniversity } from '../../services/profileService';
import { useUserStore } from '../../store/userStore';

const DEFAULT_UNIVERSITY = 'Rutgers University';

/** First hall name for a university, or '' when the university has none listed. */
function firstHallName(university: string): string {
  return getDiningHallsForUniversity(university)[0]?.name ?? '';
}

export default function UniversitySettingsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const refreshStats = useUserStore((s) => s.refreshStats);

  const [selectedUni, setSelectedUni] = useState(DEFAULT_UNIVERSITY);
  const [selectedHall, setSelectedHall] = useState(firstHallName(DEFAULT_UNIVERSITY));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Load the saved university + preferred hall so the screen starts from the
  // persisted profile, not the hardcoded default. Failures fall back to the
  // defaults already in state rather than blocking the screen.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const identity = await getProfileIdentity(data.user.id);
        if (!active) return;

        const uni = identity.university ?? DEFAULT_UNIVERSITY;
        const halls = getDiningHallsForUniversity(uni);
        const savedHall = identity.preferredDiningHall;
        const hall =
          savedHall && halls.some((h) => h.name === savedHall)
            ? savedHall
            : halls[0]?.name ?? '';

        setSelectedUni(uni);
        setSelectedHall(hall);
      } catch {
        // Keep the local defaults already in state.
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Switching university must never leave a hall from another school selected.
  function onSelectUniversity(uni: string) {
    setSelectedUni(uni);
    setSelectedHall(firstHallName(uni));
  }

  async function save() {
    setIsSaving(true);
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        throw new Error('You are not signed in.');
      }
      // Persist to Supabase FIRST; only sync the cached store after the write
      // succeeds so the Profile header reflects database truth.
      await updateProfileUniversity(data.user.id, {
        university: selectedUni,
        preferredDiningHall: selectedHall,
      });
      await refreshStats();
      Alert.alert('Saved', 'University settings updated!');
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

  if (isLoading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.scarlet} size="large" />
        </View>
      </Screen>
    );
  }

  const diningHalls = getDiningHallsForUniversity(selectedUni);

  function SelectRow({
    title,
    subtitle,
    active,
    onPress,
  }: {
    title: string;
    subtitle?: string;
    active: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: active ? colors.brandTint : colors.card,
          borderRadius: Radius.card,
          borderWidth: 1,
          borderColor: active ? colors.brandTintBorder : colors.borderCard,
          paddingVertical: 14,
          paddingHorizontal: 16,
          marginBottom: 8,
        }}
      >
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text variant="subhead" color={active ? colors.scarlet : colors.ink}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="label" color={colors.textSecondary} style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {active ? (
          <AppIcon name="checkmark" size={18} color={colors.scarlet} strokeWidth={3} />
        ) : null}
      </Pressable>
    );
  }

  return (
    <Screen scroll>
      <ScreenHeader title="University & dining" onBack={() => navigation.goBack()} />

      <Text variant="body" color={colors.textSecondary} style={{ marginTop: 4, marginBottom: 18 }}>
        Your university and dining preferences.
      </Text>

      <Text variant="overline" color={colors.textSecondary} style={{ marginBottom: 10 }}>
        Your university
      </Text>
      {UNIVERSITIES.map((uni) => (
        <SelectRow
          key={uni}
          title={uni}
          active={selectedUni === uni}
          onPress={() => onSelectUniversity(uni)}
        />
      ))}

      <Text variant="overline" color={colors.textSecondary} style={{ marginTop: 18, marginBottom: 10 }}>
        Preferred dining hall
      </Text>
      {diningHalls.length === 0 ? (
        <Text variant="body" color={colors.textSecondary} style={{ paddingVertical: 8 }}>
          No dining halls listed for this university.
        </Text>
      ) : (
        diningHalls.map((hall) => (
          <SelectRow
            key={hall.name}
            title={hall.name}
            subtitle={hall.campus}
            active={selectedHall === hall.name}
            onPress={() => setSelectedHall(hall.name)}
          />
        ))
      )}

      <Button
        label="Save"
        onPress={save}
        loading={isSaving}
        loadingLabel="Saving…"
        style={{ marginTop: 18 }}
      />
    </Screen>
  );
}

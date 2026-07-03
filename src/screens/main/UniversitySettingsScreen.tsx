import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Colors, FontFamily } from '../../theme';
import AppIcon from '../../components/ui/AppIcon';
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
      <View style={[styles.container, styles.loadingBox]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  const diningHalls = getDiningHallsForUniversity(selectedUni);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <AppIcon name="back" size={17} color={Colors.primary} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>UNIVERSITY</Text>
      <Text style={styles.subtitle}>Your university and dining preferences</Text>

      {/* University */}
      <Text style={styles.sectionTitle}>YOUR UNIVERSITY</Text>
      {UNIVERSITIES.map((uni) => (
        <TouchableOpacity
          key={uni}
          style={[styles.optionRow, selectedUni === uni && styles.optionRowActive]}
          onPress={() => onSelectUniversity(uni)}
        >
          <Text style={[styles.optionText, selectedUni === uni && styles.optionTextActive]}>
            {uni}
          </Text>
          {selectedUni === uni && <AppIcon name="checkmark" size={18} color={Colors.primary} strokeWidth={3} />}
        </TouchableOpacity>
      ))}

      {/* Dining Halls */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>PREFERRED DINING HALL</Text>
      {diningHalls.length === 0 ? (
        <Text style={styles.notice}>No dining halls listed for this university.</Text>
      ) : (
        diningHalls.map((hall) => (
          <TouchableOpacity
            key={hall.name}
            style={[styles.optionRow, selectedHall === hall.name && styles.optionRowActive]}
            onPress={() => setSelectedHall(hall.name)}
          >
            <View>
              <Text style={[styles.optionText, selectedHall === hall.name && styles.optionTextActive]}>
                {hall.name}
              </Text>
              <Text style={styles.optionSub}>{hall.campus}</Text>
            </View>
            {selectedHall === hall.name && <AppIcon name="checkmark" size={18} color={Colors.primary} strokeWidth={3} />}
          </TouchableOpacity>
        ))
      )}

      <TouchableOpacity
        style={[styles.saveBtn, isSaving && styles.saveBtnDisabled]}
        onPress={save}
        disabled={isSaving}
      >
        {isSaving ? (
          <ActivityIndicator color={Colors.background} />
        ) : (
          <Text style={styles.saveBtnText}>SAVE</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  backText: { fontFamily: FontFamily.bodyMedium, fontSize: 15, color: Colors.primary },
  title: { fontFamily: FontFamily.displayBold, fontSize: 24, color: Colors.textPrimary, letterSpacing: 1, marginBottom: 4 },
  subtitle: { fontFamily: FontFamily.body, fontSize: 14, color: Colors.textSecondary, marginBottom: 24 },
  sectionTitle: {
    fontFamily: FontFamily.displayBold,
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  notice: { fontFamily: FontFamily.body, fontSize: 13, color: Colors.textSecondary, paddingVertical: 8 },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 6,
  },
  optionRowActive: {
    borderColor: Colors.primary + '44',
    backgroundColor: Colors.primary + '08',
  },
  optionText: { fontFamily: FontFamily.bodyMedium, fontSize: 14, color: Colors.textPrimary },
  optionTextActive: { color: Colors.primary },
  optionSub: { fontFamily: FontFamily.body, fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 50,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
});

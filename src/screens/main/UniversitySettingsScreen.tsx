import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors, FontFamily } from '../../theme';
import AppIcon from '../../components/ui/AppIcon';

const UNIVERSITIES = [
  'Rutgers University',
  'Princeton University',
  'Stevens Institute of Technology',
  'NJIT',
  'Seton Hall University',
  'Montclair State University',
  'Rowan University',
];

const DINING_HALLS = [
  { name: 'Busch Dining Hall', campus: 'Busch Campus' },
  { name: 'Livingston Dining Commons', campus: 'Livingston Campus' },
  { name: 'Neilson Dining Hall', campus: 'College Ave Campus' },
  { name: 'Brower Commons', campus: 'College Ave Campus' },
];

export default function UniversitySettingsScreen({ navigation }: any) {
  const [selectedUni, setSelectedUni] = useState('Rutgers University');
  const [selectedHall, setSelectedHall] = useState('Busch Dining Hall');

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
          onPress={() => setSelectedUni(uni)}
        >
          <Text style={[styles.optionText, selectedUni === uni && styles.optionTextActive]}>
            {uni}
          </Text>
          {selectedUni === uni && <AppIcon name="checkmark" size={18} color={Colors.primary} strokeWidth={3} />}
        </TouchableOpacity>
      ))}

      {/* Dining Halls */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>PREFERRED DINING HALL</Text>
      {DINING_HALLS.map((hall) => (
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
      ))}

      <TouchableOpacity
        style={styles.saveBtn}
        onPress={() => {
          Alert.alert('Saved', 'University settings updated!');
          navigation.goBack();
        }}
      >
        <Text style={styles.saveBtnText}>SAVE</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
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
  saveBtnText: { fontFamily: FontFamily.displayBold, fontSize: 16, color: Colors.background },
});

import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, GestureResponderEvent } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Colors, FontFamily, FontSize, Shadow } from '../theme';

import HomeScreen from '../screens/main/HomeScreen';
import MealLoggerScreen from '../screens/main/MealLoggerScreen';
import ChallengesScreen from '../screens/main/ChallengesScreen';
import LeaderboardScreen from '../screens/main/LeaderboardScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import RewardsScreen from '../screens/main/RewardsScreen';
import EditGoalsScreen from '../screens/main/EditGoalsScreen';
import NotificationsSettingsScreen from '../screens/main/NotificationsSettingsScreen';
import UniversitySettingsScreen from '../screens/main/UniversitySettingsScreen';
import RuleSettingsScreen from '../screens/main/RuleSettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ icon, label, focused }: { icon: string; label: string; focused: boolean }) {
  return (
    <View style={styles.tabIcon}>
      <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.55 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

// Raised, brand-filled primary action for logging a meal — the emphasized tab.
function RaisedLogButton({ onPress }: { onPress?: (e: GestureResponderEvent) => void }) {
  return (
    <View style={styles.raisedWrap}>
      <TouchableOpacity style={styles.raisedButton} onPress={onPress} activeOpacity={0.85}>
        <Text style={styles.raisedPlus}>＋</Text>
      </TouchableOpacity>
      <Text style={styles.raisedLabel}>Log</Text>
    </View>
  );
}

function HomeTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏠" label="Home" focused={focused} /> }}
      />
      <Tab.Screen
        name="Leaderboard"
        component={LeaderboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="🏆" label="League" focused={focused} /> }}
      />
      <Tab.Screen
        name="Log"
        component={MealLoggerScreen}
        options={{
          tabBarButton: (props) => <RaisedLogButton onPress={props.onPress ?? undefined} />,
        }}
      />
      <Tab.Screen
        name="Challenges"
        component={ChallengesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="⚔️" label="Challenges" focused={focused} /> }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="👤" label="Profile" focused={focused} /> }}
      />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={HomeTabs} />
      <Stack.Screen name="Rewards" component={RewardsScreen} />
      <Stack.Screen name="EditGoals" component={EditGoalsScreen} />
      <Stack.Screen name="RuleSettings" component={RuleSettingsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationsSettingsScreen} />
      <Stack.Screen name="UniversitySettings" component={UniversitySettingsScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    height: 88,
    paddingBottom: 22,
    paddingTop: 10,
  },
  tabIcon: { alignItems: 'center', justifyContent: 'center', gap: 3, width: 64 },
  tabEmoji: { fontSize: 20 },
  tabLabel: { fontFamily: FontFamily.bodyMedium, fontSize: FontSize.micro, color: Colors.textSecondary },
  tabLabelActive: { color: Colors.primary, fontFamily: FontFamily.bodySemiBold },

  raisedWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  raisedButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
    borderWidth: 4,
    borderColor: Colors.background,
    ...Shadow.floating,
  },
  raisedPlus: { fontFamily: FontFamily.displayBold, fontSize: 30, color: Colors.textPrimary, marginTop: -2 },
  raisedLabel: { fontFamily: FontFamily.bodySemiBold, fontSize: FontSize.micro, color: Colors.primary, marginTop: 2 },
});

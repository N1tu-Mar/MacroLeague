import React from 'react';
import { View, Text, Pressable, GestureResponderEvent } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FontFamily, glowShadow, useTheme } from '../theme';

import HomeScreen from '../screens/main/HomeScreen';
import MealLoggerScreen from '../screens/main/MealLoggerScreen';
import ChallengesScreen from '../screens/main/ChallengesScreen';
import CoachScreen from '../screens/main/CoachScreen';
import LeaderboardScreen from '../screens/main/LeaderboardScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import RewardsScreen from '../screens/main/RewardsScreen';
import EditGoalsScreen from '../screens/main/EditGoalsScreen';
import NotificationsSettingsScreen from '../screens/main/NotificationsSettingsScreen';
import UniversitySettingsScreen from '../screens/main/UniversitySettingsScreen';
import SocialAccountsScreen from '../screens/main/SocialAccountsScreen';
import ChangePasswordScreen from '../screens/main/ChangePasswordScreen';
import RuleSettingsScreen from '../screens/main/RuleSettingsScreen';
import AppIcon, { AppIconName } from '../components/ui/AppIcon';
import RotatingTrophy from '../components/animations/RotatingTrophy';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ icon, label, focused }: { icon: AppIconName; label: string; focused: boolean }) {
  const { colors } = useTheme();
  const tint = focused ? colors.scarlet : colors.textTertiary;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3, width: 60 }}>
      {icon === 'league' ? (
        <RotatingTrophy size={22} color={tint} />
      ) : (
        <AppIcon name={icon} size={22} color={tint} strokeWidth={focused ? 2.5 : 2} />
      )}
      <Text
        style={{
          fontFamily: focused ? FontFamily.semibold : FontFamily.medium,
          fontSize: 10,
          color: tint,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// Raised scarlet Log FAB (spec: 54px circle, canvas-colored border, brand glow).
function RaisedLogButton({ onPress }: { onPress?: (e: GestureResponderEvent) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Log a meal"
        style={({ pressed }) => [
          {
            width: 54,
            height: 54,
            borderRadius: 27,
            backgroundColor: colors.scarlet,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: -24,
            borderWidth: 4,
            borderColor: colors.canvas,
            transform: [{ scale: pressed ? 0.94 : 1 }],
            ...glowShadow(colors.scarlet),
          },
        ]}
      >
        <AppIcon name="plus" size={26} color={colors.onPrimary} strokeWidth={2.5} />
      </Pressable>
      <Text style={{ fontFamily: FontFamily.semibold, fontSize: 10, color: colors.scarlet, marginTop: 2 }}>Log</Text>
    </View>
  );
}

function HomeTabs() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.borderCard,
          height: 62 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
        },
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="home" label="Today" focused={focused} /> }} />
      <Tab.Screen name="Leaderboard" component={LeaderboardScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="league" label="League" focused={focused} /> }} />
      <Tab.Screen name="Log" component={MealLoggerScreen}
        options={{ tabBarButton: (props) => <RaisedLogButton onPress={props.onPress ?? undefined} /> }} />
      <Tab.Screen name="Challenges" component={ChallengesScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="challenges" label="Challenges" focused={focused} /> }} />
      <Tab.Screen name="Coach" component={CoachScreen}
        options={{ tabBarIcon: ({ focused }) => <TabIcon icon="coach" label="Coach" focused={focused} /> }} />
    </Tab.Navigator>
  );
}

export default function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={HomeTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Rewards" component={RewardsScreen} />
      <Stack.Screen name="EditGoals" component={EditGoalsScreen} />
      <Stack.Screen name="RuleSettings" component={RuleSettingsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationsSettingsScreen} />
      <Stack.Screen name="UniversitySettings" component={UniversitySettingsScreen} />
      <Stack.Screen name="SocialAccounts" component={SocialAccountsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
    </Stack.Navigator>
  );
}

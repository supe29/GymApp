import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useFocusEffect } from '@react-navigation/native';
import { createNativeStackNavigator, type NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { GymSupabaseClient } from 'api-client';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';

import TabIcon, { type TabIconName } from '../components/TabIcon';
import DashboardScreen from '../features/dashboard/DashboardScreen';
import WorkoutHistoryScreen from '../features/history/WorkoutHistoryScreen';
import MuscleExplorerScreen from '../features/muscle-explorer/MuscleExplorerScreen';
import DiaryScreen from '../features/nutrition/DiaryScreen';
import NutritionTargetsScreen from '../features/plan/NutritionTargetsScreen';
import WorkoutPlanScreen from '../features/plan/WorkoutPlanScreen';
import EditProfileScreen from '../features/profile/EditProfileScreen';
import PersonalRecordsScreen from '../features/progress/PersonalRecordsScreen';
import WeightTrendScreen from '../features/progress/WeightTrendScreen';
import { getSupabaseClient } from '../lib/supabaseClient';
import FreeformSessionScreen from '../features/workout-session/FreeformSessionScreen';
import SessionScreen from '../features/workout-session/SessionScreen';

export interface MainTabsProps {
  client?: GymSupabaseClient;
  userId: string;
}

function HeaderLinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 12 }} accessibilityRole="button">
      <Text style={{ color: '#111', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

type DashboardStackParamList = {
  DashboardHome: undefined;
  Session: { plannedSessionId: string };
  FreeformSession: undefined;
  History: undefined;
  MuscleExplorer: undefined;
};
const DashboardStack = createNativeStackNavigator<DashboardStackParamList>();

/**
 * Dashboard is the action hub: every quick-log/start-session/view-history
 * affordance DashboardScreen exposes is a callback prop (per its own
 * contract), wired here to real pushes/tab switches — DashboardScreen
 * itself has no navigation dependency.
 */
/**
 * Reloads the dashboard every time it regains focus (back from a session,
 * or switching back from the Nutrition/Progress tabs), so it never shows
 * stale totals. Kept here so DashboardScreen stays navigation-free.
 */
function FocusRefreshingDashboard({
  client,
  userId,
  navigation,
}: {
  client: GymSupabaseClient;
  userId: string;
  navigation: NativeStackNavigationProp<DashboardStackParamList, 'DashboardHome'>;
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      // The first focus is the mount, which already loads.
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      setRefreshToken((token) => token + 1);
    }, []),
  );

  const goToTab = (tab: string) => navigation.getParent()?.navigate(tab as never);

  return (
    <DashboardScreen
      client={client}
      userId={userId}
      refreshToken={refreshToken}
      onStartSession={(plannedSessionId) => navigation.navigate('Session', { plannedSessionId })}
      onStartFreeform={() => navigation.navigate('FreeformSession')}
      onLogFood={() => goToTab('Nutrition')}
      onLogWeight={() => goToTab('Progress')}
      onViewWeight={() => goToTab('Progress')}
      onViewHistory={() => navigation.navigate('History')}
      onBrowseMuscles={() => navigation.navigate('MuscleExplorer')}
      onCreatePlan={() => goToTab('Plan')}
      onSetTargets={() => goToTab('Nutrition')}
    />
  );
}

function DashboardStackNavigator({ client, userId }: { client: GymSupabaseClient; userId: string }) {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStack.Screen name="DashboardHome">
        {({ navigation }) => <FocusRefreshingDashboard client={client} userId={userId} navigation={navigation} />}
      </DashboardStack.Screen>
      <DashboardStack.Screen name="Session" options={{ headerShown: true, title: 'Session' }}>
        {({ navigation, route }) => (
          <SessionScreen
            client={client}
            userId={userId}
            plannedSessionId={route.params.plannedSessionId}
            onSessionCompleted={() => navigation.goBack()}
          />
        )}
      </DashboardStack.Screen>
      <DashboardStack.Screen name="FreeformSession" options={{ headerShown: true, title: 'Freeform workout' }}>
        {({ navigation }) => (
          <FreeformSessionScreen client={client} userId={userId} onSessionCompleted={() => navigation.goBack()} />
        )}
      </DashboardStack.Screen>
      <DashboardStack.Screen name="History" options={{ headerShown: true, title: 'History' }}>
        {({ navigation }) => (
          <WorkoutHistoryScreen client={client} userId={userId} onStartWorkout={() => navigation.navigate('FreeformSession')} />
        )}
      </DashboardStack.Screen>
      <DashboardStack.Screen name="MuscleExplorer" options={{ headerShown: true, title: 'Muscle Explorer' }}>
        {() => <MuscleExplorerScreen client={client} userId={userId} />}
      </DashboardStack.Screen>
    </DashboardStack.Navigator>
  );
}

type NutritionStackParamList = {
  Diary: undefined;
  NutritionTargets: undefined;
};
const NutritionStack = createNativeStackNavigator<NutritionStackParamList>();

function NutritionStackNavigator({ client, userId }: { client: GymSupabaseClient; userId: string }) {
  return (
    <NutritionStack.Navigator>
      <NutritionStack.Screen
        name="Diary"
        options={({ navigation }) => ({
          title: 'Diary',
          headerRight: () => <HeaderLinkButton label="Targets" onPress={() => navigation.navigate('NutritionTargets')} />,
        })}
      >
        {() => <DiaryScreen client={client} userId={userId} />}
      </NutritionStack.Screen>
      <NutritionStack.Screen name="NutritionTargets" options={{ title: 'Nutrition targets' }}>
        {() => <NutritionTargetsScreen client={client} userId={userId} />}
      </NutritionStack.Screen>
    </NutritionStack.Navigator>
  );
}

type ProgressStackParamList = {
  WeightTrend: undefined;
  PersonalRecords: undefined;
};
const ProgressStack = createNativeStackNavigator<ProgressStackParamList>();

function ProgressStackNavigator({ client, userId }: { client: GymSupabaseClient; userId: string }) {
  return (
    <ProgressStack.Navigator>
      <ProgressStack.Screen
        name="WeightTrend"
        options={({ navigation }) => ({
          title: 'Weight trend',
          headerRight: () => <HeaderLinkButton label="Records" onPress={() => navigation.navigate('PersonalRecords')} />,
        })}
      >
        {() => <WeightTrendScreen client={client} userId={userId} />}
      </ProgressStack.Screen>
      <ProgressStack.Screen name="PersonalRecords" options={{ title: 'Personal records' }}>
        {({ navigation }) => (
          <PersonalRecordsScreen
            client={client}
            userId={userId}
            onStartWorkout={() => navigation.getParent()?.navigate('Dashboard' as never)}
          />
        )}
      </ProgressStack.Screen>
    </ProgressStack.Navigator>
  );
}

const Tabs = createBottomTabNavigator();

/**
 * UX-3/FR-8.3: the signed-in, onboarded app's primary navigation — 5
 * bottom tabs. Dashboard is the only tab with a deep stack (it's the
 * action hub); Plan and Profile are single screens since neither has a
 * built-in "push further" affordance; Nutrition and Progress each get one
 * header-button-triggered secondary screen rather than modifying
 * `DiaryScreen.tsx`/`WeightTrendScreen.tsx` to add a push of their own.
 */
const TAB_ICONS: Record<string, TabIconName> = {
  Dashboard: 'dashboard',
  Plan: 'plan',
  Nutrition: 'nutrition',
  Progress: 'progress',
  Profile: 'profile',
};

export default function MainTabs({ client = getSupabaseClient(), userId }: MainTabsProps) {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#111',
        tabBarInactiveTintColor: '#888',
        // The default 49px bar squeezes the label under a full-size icon
        // (its box shrinks below the text height and clips it on web).
        tabBarStyle: { height: 64 },
        tabBarItemStyle: { paddingVertical: 4 },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14 },
        tabBarIcon: ({ color, size }) => (
          <TabIcon name={TAB_ICONS[route.name] ?? 'dashboard'} color={color} size={size} />
        ),
      })}
    >
      <Tabs.Screen name="Dashboard">{() => <DashboardStackNavigator client={client} userId={userId} />}</Tabs.Screen>
      <Tabs.Screen name="Plan" options={{ headerShown: true }}>
        {() => <WorkoutPlanScreen client={client} userId={userId} />}
      </Tabs.Screen>
      <Tabs.Screen name="Nutrition">{() => <NutritionStackNavigator client={client} userId={userId} />}</Tabs.Screen>
      <Tabs.Screen name="Progress">{() => <ProgressStackNavigator client={client} userId={userId} />}</Tabs.Screen>
      <Tabs.Screen name="Profile" options={{ headerShown: true }}>
        {() => <EditProfileScreen client={client} userId={userId} />}
      </Tabs.Screen>
    </Tabs.Navigator>
  );
}

import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { APP_NAME, FIELD_ROLES } from './src/config';
import { C, F } from './src/theme';
import { DialogHost } from './src/components/dialog';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TrackingWatcher } from './src/components/TrackingWatcher';
import { installGlobalErrorHandlers } from './src/utils/errorReport';
import { setSentryUser } from './src/sentry';
import { needsConsent, useCurrentUser, useStore } from './src/store/useStore';
import LoginScreen from './src/screens/LoginScreen';
import SpgTodayScreen from './src/screens/SpgTodayScreen';
import OpsTodayScreen from './src/screens/OpsTodayScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import ConsentScreen from './src/screens/ConsentScreen';
import SpgScheduleScreen from './src/screens/SpgScheduleScreen';
import LiveMapScreen from './src/screens/LiveMapScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import RequestsScreen from './src/screens/requests/RequestsScreen';
import RequestFormScreen from './src/screens/requests/RequestFormScreen';
import RequestDetailScreen from './src/screens/requests/RequestDetailScreen';
import type { RequestsStackParams } from './src/screens/requests/types';
import DataHomeScreen from './src/screens/data/DataHomeScreen';
import SpgDetailScreen from './src/screens/data/SpgDetailScreen';
import AccountFormScreen from './src/screens/data/AccountFormScreen';
import VenueFormScreen from './src/screens/data/VenueFormScreen';
import CampaignFormScreen from './src/screens/data/CampaignFormScreen';
import type { DataStackParams } from './src/screens/data/types';

installGlobalErrorHandlers();

const Tabs = createBottomTabNavigator();
const ReqStack = createNativeStackNavigator<RequestsStackParams>();
const DataStack = createNativeStackNavigator<DataStackParams>();

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  'Hari Ini': ['today', 'today-outline'],
  Jadwal: ['calendar', 'calendar-outline'],
  Request: ['document-text', 'document-text-outline'],
  Peta: ['map', 'map-outline'],
  Laporan: ['bar-chart', 'bar-chart-outline'],
  Data: ['people', 'people-outline'],
  Profil: ['person-circle', 'person-circle-outline'],
};

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.primary } };

const header = {
  headerStyle: { backgroundColor: C.primary },
  headerTintColor: C.onPrimary,
  headerTitleStyle: { fontFamily: F.bold },
};

function RequestsTab() {
  return (
    <ReqStack.Navigator screenOptions={header}>
      <ReqStack.Screen name="Requests" component={RequestsScreen} options={{ title: 'Request' }} />
      <ReqStack.Screen name="RequestForm" component={RequestFormScreen} options={{ title: 'Request baru' }} />
      <ReqStack.Screen name="RequestDetail" component={RequestDetailScreen} options={{ title: 'Detail request' }} />
    </ReqStack.Navigator>
  );
}

function DataTab() {
  return (
    <DataStack.Navigator screenOptions={header}>
      <DataStack.Screen name="DataHome" component={DataHomeScreen} options={{ title: 'Data' }} />
      <DataStack.Screen name="SpgDetail" component={SpgDetailScreen} options={{ title: 'Detail akun' }} />
      <DataStack.Screen name="AccountForm" component={AccountFormScreen} options={{ title: 'Akun baru' }} />
      <DataStack.Screen name="VenueForm" component={VenueFormScreen} options={{ title: 'Venue' }} />
      <DataStack.Screen name="CampaignForm" component={CampaignFormScreen} options={{ title: 'Campaign' }} />
    </DataStack.Navigator>
  );
}

/** Tabs per role (spec: Users & Roles). RLS decides what each tab can read; this only hides what a role never uses. */
function Shell() {
  const me = useCurrentUser()!;
  const role = me.role;
  const field = FIELD_ROLES.includes(role);
  const staff = role === 'super_admin' || role === 'pic' || role === 'back_office';
  const insets = useSafeAreaInsets();
  // Tab roots carry their own large title, so no app-name bar above them; stacks keep their header.
  const stackTab = { headerShown: false, sceneStyle: { paddingTop: 0, backgroundColor: C.bg } };
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        ...header,
        headerShown: false,
        sceneStyle: { paddingTop: insets.top, backgroundColor: C.bg },
        headerTitle: APP_NAME,
        tabBarActiveTintColor: C.primary,
        tabBarLabelStyle: { fontFamily: F.semi },
        tabBarIcon: ({ focused, color, size }) => {
          const [on, off] = ICONS[route.name] ?? ['ellipse', 'ellipse-outline'];
          return <Ionicons name={focused ? on : off} size={size} color={color} />;
        },
      })}
    >
      <Tabs.Screen name="Hari Ini" component={field ? SpgTodayScreen : OpsTodayScreen} />
      {field && <Tabs.Screen name="Jadwal" component={SpgScheduleScreen} />}
      {!field && <Tabs.Screen name="Request" component={RequestsTab} options={stackTab} />}
      {(!field || role === 'coordinator') && <Tabs.Screen name="Peta" component={LiveMapScreen} />}
      {!field && <Tabs.Screen name="Laporan" component={ReportsScreen} />}
      {staff && <Tabs.Screen name="Data" component={DataTab} options={stackTab} />}
      <Tabs.Screen name="Profil" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

function Root() {
  const ready = useStore((s) => s.ready);
  const me = useCurrentUser();
  const init = useStore((s) => s.init);
  const syncQueue = useStore((s) => s.syncQueue);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => setSentryUser(me?.id ?? null), [me?.id]);

  // Coming back online sends whatever was queued at a venue without signal.
  useEffect(
    () =>
      NetInfo.addEventListener((s) => {
        if (s.isConnected && s.isInternetReachable !== false) void syncQueue();
      }),
    [syncQueue],
  );

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primary }}>
        <ActivityIndicator color={C.gold} />
      </View>
    );
  }
  if (!me) return <LoginScreen />;
  if (needsConsent(me)) return <ConsentScreen />;
  return (
    <>
      <TrackingWatcher />
      <Shell />
    </>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer theme={theme}>
          <StatusBar style="light" />
          <Root />
        </NavigationContainer>
        <DialogHost />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

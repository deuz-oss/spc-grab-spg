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
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { APP_NAME, FIELD_ROLES } from './src/config';
import { C, F } from './src/theme';
import { DialogHost } from './src/components/dialog';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { TrackingWatcher } from './src/components/TrackingWatcher';
import { installGlobalErrorHandlers } from './src/utils/errorReport';
import { setSentryUser } from './src/sentry';
import { useCurrentUser, useStore } from './src/store/useStore';
import LoginScreen from './src/screens/LoginScreen';
import SpgTodayScreen from './src/screens/SpgTodayScreen';
import OpsTodayScreen from './src/screens/OpsTodayScreen';
import ProfileScreen from './src/screens/ProfileScreen';

installGlobalErrorHandlers();

const Tabs = createBottomTabNavigator();

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  'Hari Ini': ['today', 'today-outline'],
  Profil: ['person-circle', 'person-circle-outline'],
};

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.primary } };

function Shell() {
  const me = useCurrentUser()!;
  const field = FIELD_ROLES.includes(me.role);
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: C.primary },
        headerTintColor: C.onPrimary,
        headerTitleStyle: { fontFamily: F.bold },
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
  return me ? (
    <>
      <TrackingWatcher />
      <Shell />
    </>
  ) : (
    <LoginScreen />
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

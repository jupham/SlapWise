import React, { useEffect, useState } from 'react';
import { StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import type { RootStackParamList } from './navigation/types';
import { stackScreenOptions } from './navigation/screenOptions';
import { AuthService } from './services/AuthService';
import { GroupService } from './services/GroupService';
import * as Notifications from 'expo-notifications';
import { configureNotificationHandler, registerForPush } from './services/PushService';
import { navigationRef, routeToNotification, type PushPayload } from './navigation/pushRouting';
import { useStore } from './store';


import AuthNavigator from './navigation/AuthNavigator';
import AppNavigator from './navigation/AppNavigator';
import WelcomeScreen from './screens/WelcomeScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import JoinGroupScreen from './screens/JoinGroupScreen';
import { color } from './theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

// Set once, outside the component: it configures a module-level singleton, and
// re-running it on every render would be pointless work.
configureNotificationHandler();

// Keep the native splash up through font loading and bootstrap, rather than
// letting it auto-hide on first render into a spinner on a blank screen.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  // Held alongside bootstrap so the first paint is already in Oswald — showing
  // the UI first would flash every title in the fallback face.
  const [fontsLoaded] = useFonts({ Oswald_600SemiBold, Oswald_700Bold });
  const setPlayer = useStore((s) => s.setPlayer);
  const setGroups = useStore((s) => s.setGroups);
  const setActiveGroup = useStore((s) => s.setActiveGroup);
  const groups = useStore((s) => s.groups);

  useEffect(() => {
    async function bootstrap() {
      try {
        const player = await AuthService.currentPlayer();
        if (!player) {
          setInitialRoute('Auth');
          return;
        }
        setPlayer(player);

        const groups = await GroupService.getGroups();
        setGroups(groups);

        if (groups.length === 0) {
          setInitialRoute('Welcome');
        } else {
          setActiveGroup({ groupId: groups[0].groupId, groupName: groups[0].name });
          setInitialRoute('App');
        }

        // After the session is known to be good, because registering is an
        // authenticated call. Deliberately not awaited — a slow permission
        // prompt must not hold up the first paint, and the result only affects
        // whether pushes arrive later.
        void registerForPush();
      } catch (err: unknown) {
        console.error('[App] bootstrap:', err);
        setInitialRoute('Auth');
      }
    }
    void bootstrap();
  }, [setPlayer, setGroups, setActiveGroup]);

  /**
   * A tapped notification, including the one that cold-started the app.
   *
   * `useLastNotificationResponse` holds the tap rather than firing it as an
   * event, which is what makes the cold-start case work: bootstrap and the
   * navigator take a moment to come up, and the response is still sitting here
   * waiting when they do. The `initialRoute` guard is what defers it until
   * then.
   */
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse || initialRoute !== 'App') return;

    const payload = lastResponse.notification.request.content.data as PushPayload;
    const group = groups.find((g) => g.groupId === payload.groupId);
    if (!group) return;

    // The tap may be for a group other than the one showing. Switch first —
    // every tab reads the active group from the store, so navigating without
    // this would land on the right screen showing the wrong group's data.
    setActiveGroup({ groupId: group.groupId, groupName: group.name });
    routeToNotification(payload, group.name);
  }, [lastResponse, initialRoute, groups, setActiveGroup]);

  const ready = initialRoute !== null && fontsLoaded;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  // The native splash is still covering the screen until `ready`.
  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={color.bg} />
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ ...stackScreenOptions, headerShown: false }}
          >
            <Stack.Screen name="Auth" component={AuthNavigator} />
            <Stack.Screen
              name="Welcome"
              component={WelcomeScreen}
              options={{ headerShown: true, title: 'SlapWise', headerBackVisible: false }}
            />
            <Stack.Screen name="App" component={AppNavigator} />
            <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ headerShown: true, title: 'Create Group' }} />
            <Stack.Screen name="JoinGroup" component={JoinGroupScreen} options={{ headerShown: true, title: 'Join Group' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

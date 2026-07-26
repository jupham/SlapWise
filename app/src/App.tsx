import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Oswald_600SemiBold, Oswald_700Bold } from '@expo-google-fonts/oswald';
import type { RootStackParamList } from './navigation/types';
import { AuthService } from './services/AuthService';
import { GroupService } from './services/GroupService';
import { useStore } from './store';
import { color } from './theme';

import AuthNavigator from './navigation/AuthNavigator';
import AppNavigator from './navigation/AppNavigator';
import WelcomeScreen from './screens/WelcomeScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import JoinGroupScreen from './screens/JoinGroupScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
  // Held alongside bootstrap so the first paint is already in Oswald — showing
  // the UI first would flash every title in the fallback face.
  const [fontsLoaded] = useFonts({ Oswald_600SemiBold, Oswald_700Bold });
  const setPlayer = useStore((s) => s.setPlayer);
  const setGroups = useStore((s) => s.setGroups);
  const setActiveGroup = useStore((s) => s.setActiveGroup);

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
      } catch (err: unknown) {
        console.error('[App] bootstrap:', err);
        setInitialRoute('Auth');
      }
    }
    void bootstrap();
  }, [setPlayer, setGroups, setActiveGroup]);

  if (!initialRoute || !fontsLoaded) {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
        <StatusBar barStyle="light-content" backgroundColor={color.bg} />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={color.accent} />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={color.bg} />
        <NavigationContainer>
          <Stack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
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

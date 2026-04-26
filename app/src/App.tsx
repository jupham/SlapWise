import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList } from './navigation/types';
import { AuthService } from './services/AuthService';
import { GroupService } from './services/GroupService';
import { useStore } from './store';

import AuthNavigator from './navigation/AuthNavigator';
import AppNavigator from './navigation/AppNavigator';
import WelcomeScreen from './screens/WelcomeScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import JoinGroupScreen from './screens/JoinGroupScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList | null>(null);
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

  if (!initialRoute) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
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

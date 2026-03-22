import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { getCurrentUser } from 'aws-amplify/auth';
import type { RootStackParamList } from './navigation/types';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import ConfirmEmailScreen from './screens/ConfirmEmailScreen';
import GroupListScreen from './screens/GroupListScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import CreateGroupScreen from './screens/CreateGroupScreen';
import JoinGroupScreen from './screens/JoinGroupScreen';
import CreateChallengeScreen from './screens/CreateChallengeScreen';
import PendingDebtsScreen from './screens/PendingDebtsScreen';
import ResolutionConfirmationScreen from './screens/ResolutionConfirmationScreen';
import LedgerScreen from './screens/LedgerScreen';
import MySlateScreen from './screens/MySlateScreen';
import GroupFeedScreen from './screens/GroupFeedScreen';
import RecordGameCallScreen from './screens/RecordGameCallScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [initialRoute, setInitialRoute] = useState<'Login' | 'GroupList' | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(() => setInitialRoute('GroupList'))
      .catch(() => setInitialRoute('Login'));
  }, []);

  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRoute}>
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Register' }} />
        <Stack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} options={{ title: 'Verify Email' }} />
        <Stack.Screen name="GroupList" component={GroupListScreen} options={{ title: 'My Groups', headerBackVisible: false }} />
        <Stack.Screen name="GroupDetail" component={GroupDetailScreen} options={({ route }) => ({ title: route.params.groupName })} />
        <Stack.Screen name="CreateGroup" component={CreateGroupScreen} options={{ title: 'Create Group' }} />
        <Stack.Screen name="JoinGroup" component={JoinGroupScreen} options={{ title: 'Join Group' }} />
        <Stack.Screen name="CreateChallenge" component={CreateChallengeScreen} options={{ title: 'Call Manchester' }} />
        <Stack.Screen name="PendingDebts" component={PendingDebtsScreen} options={({ route }) => ({ title: `Pending — ${route.params.groupName}` })} />
        <Stack.Screen name="ResolutionConfirmation" component={ResolutionConfirmationScreen} options={{ title: 'Confirm Resolution' }} />
        <Stack.Screen name="Ledger" component={LedgerScreen} options={({ route }) => ({ title: `Ledger — ${route.params.groupName}` })} />
        <Stack.Screen name="MySlate" component={MySlateScreen} options={{ title: 'My Slate' }} />
        <Stack.Screen name="GroupFeed" component={GroupFeedScreen} options={({ route }) => ({ title: `Feed — ${route.params.groupName}` })} />
        <Stack.Screen name="RecordGameCall" component={RecordGameCallScreen} options={{ title: 'Record Game Call' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

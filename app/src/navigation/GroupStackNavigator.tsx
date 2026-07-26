import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { GroupStackParamList } from './types';
import { stackScreenOptions } from './screenOptions';

import GroupTabNavigator from './GroupTabNavigator';
import CreateChallengeScreen from '../screens/CreateChallengeScreen';
import PendingDebtsScreen from '../screens/PendingDebtsScreen';
import ResolutionConfirmationScreen from '../screens/ResolutionConfirmationScreen';
import LedgerScreen from '../screens/LedgerScreen';
import RecordGameCallScreen from '../screens/RecordGameCallScreen';
import ReadInScreen from '../screens/ReadInScreen';
import ReadInPlayersScreen from '../screens/ReadInPlayersScreen';
import ReadInGameNameScreen from '../screens/ReadInGameNameScreen';
import InfinityGrogSentenceScreen from '../screens/InfinityGrogSentenceScreen';
import CreateGroupScreen from '../screens/CreateGroupScreen';
import JoinGroupScreen from '../screens/JoinGroupScreen';

const Stack = createNativeStackNavigator<GroupStackParamList>();

export default function GroupStackNavigator() {
  return (
    <Stack.Navigator screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="GroupTabs"
        component={GroupTabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateChallenge"
        component={CreateChallengeScreen}
        options={{ title: 'Call Manchester' }}
      />
      <Stack.Screen
        name="PendingDebts"
        component={PendingDebtsScreen}
        options={({ route }) => ({ title: `Pending — ${route.params.groupName}` })}
      />
      <Stack.Screen
        name="ResolutionConfirmation"
        component={ResolutionConfirmationScreen}
        // Placeholder only, shown while the debt loads. The screen retitles
        // itself once it knows whether you can act, are waiting, or are just
        // looking at someone else's Manchester.
        options={{ title: 'Manchester' }}
      />
      <Stack.Screen
        name="Ledger"
        component={LedgerScreen}
        options={({ route }) => ({ title: `Ledger — ${route.params.groupName}` })}
      />
      <Stack.Screen
        name="RecordGameCall"
        component={RecordGameCallScreen}
        options={{ title: 'Record Game Call' }}
      />
      <Stack.Screen
        name="ReadIn"
        component={ReadInScreen}
        options={{ title: 'Read In' }}
      />
      <Stack.Screen
        name="ReadInPlayers"
        component={ReadInPlayersScreen}
        options={({ route }) => ({ title: `Read In — ${route.params.groupName}` })}
      />
      <Stack.Screen
        name="ReadInGameName"
        component={ReadInGameNameScreen}
        options={{ title: 'Set Game Name' }}
      />
      <Stack.Screen
        name="InfinityGrogSentence"
        component={InfinityGrogSentenceScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateGroup"
        component={CreateGroupScreen}
        options={{ title: 'Create Group' }}
      />
      <Stack.Screen
        name="JoinGroup"
        component={JoinGroupScreen}
        options={{ title: 'Join Group' }}
      />
    </Stack.Navigator>
  );
}

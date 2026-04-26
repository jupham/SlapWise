import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, Text } from 'react-native';
import type { GroupTabParamList } from './types';
import { useStore } from '../store';
import GroupFeedScreen from '../screens/GroupFeedScreen';
import MySlateScreen from '../screens/MySlateScreen';
import GroupHomeScreen from '../screens/GroupHomeScreen';

const Tab = createBottomTabNavigator<GroupTabParamList>();

export default function GroupTabNavigator() {
  const activeGroup = useStore((s) => s.activeGroup);
  const groupName = activeGroup?.groupName ?? 'Group';

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <Tab.Navigator
        screenOptions={{
          headerShown: true,
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#333',
          headerTitleStyle: { fontWeight: '700' },
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8e8e93',
        }}
      >
      <Tab.Screen
        name="Feed"
        component={GroupFeedScreen}
        options={{
          title: 'Feed',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📰</Text>,
        }}
      />
      <Tab.Screen
        name="MySlate"
        component={MySlateScreen}
        options={{
          title: 'My Slate',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text>,
        }}
      />
      <Tab.Screen
        name="Group"
        component={GroupHomeScreen}
        options={{
          title: groupName,
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👥</Text>,
        }}
      />
    </Tab.Navigator>
    </>
  );
}

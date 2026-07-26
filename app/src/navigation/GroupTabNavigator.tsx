import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { GroupTabParamList } from './types';
import { useStore } from '../store';
import { color, font, size } from '../theme';
import GroupFeedScreen from '../screens/GroupFeedScreen';
import MySlateScreen from '../screens/MySlateScreen';
import InfinityGrogReviewScreen from '../screens/InfinityGrogReviewScreen';
import GroupHomeScreen from '../screens/GroupHomeScreen';
import { CrewIcon, FeedIcon, GrogIcon, SlateIcon } from '../screens/components/TabIcons';

const Tab = createBottomTabNavigator<GroupTabParamList>();

export default function GroupTabNavigator() {
  const activeGroup = useStore((s) => s.activeGroup);
  const groupName = activeGroup?.groupName ?? 'Group';
  const insets = useSafeAreaInsets();

  return (
    <>
      {/* Every tab is dark now, so the status bar is set once here rather than
          per-screen. */}
      <StatusBar barStyle="light-content" backgroundColor={color.bg} />
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.accent,
          tabBarInactiveTintColor: color.textDim,
          tabBarStyle: {
            backgroundColor: color.bg,
            borderTopColor: color.border,
            borderTopWidth: 1,
            // Grow by the bottom inset rather than using a fixed height: on a
            // gesture-navigation device the home indicator otherwise sits on
            // top of the labels.
            height: 62 + insets.bottom,
            paddingTop: 6,
            paddingBottom: 8 + insets.bottom,
          },
          tabBarLabelStyle: {
            fontFamily: font.body,
            fontSize: size.label,
            fontWeight: '600',
            letterSpacing: 0.3,
          },
        }}
      >
        <Tab.Screen
          name="Feed"
          component={GroupFeedScreen}
          options={{
            title: 'Feed',
            tabBarIcon: ({ color: c }) => <FeedIcon color={c} />,
          }}
        />
        <Tab.Screen
          name="MySlate"
          component={MySlateScreen}
          options={{
            title: 'My Slate',
            tabBarIcon: ({ color: c }) => <SlateIcon color={c} />,
          }}
        />
        <Tab.Screen
          name="Grog"
          component={InfinityGrogReviewScreen}
          options={{
            title: 'The Grog',
            tabBarIcon: ({ color: c }) => <GrogIcon color={c} />,
          }}
        />
        <Tab.Screen
          name="Group"
          component={GroupHomeScreen}
          options={{
            title: groupName,
            tabBarIcon: ({ color: c }) => <CrewIcon color={c} />,
          }}
        />
      </Tab.Navigator>
    </>
  );
}

import React from 'react';
import { createDrawerNavigator } from '@react-navigation/drawer';
import type { DrawerParamList } from './types';
import DrawerContent from './DrawerContent';
import GroupStackNavigator from './GroupStackNavigator';

const Drawer = createDrawerNavigator<DrawerParamList>();

export default function AppNavigator() {
  return (
    <Drawer.Navigator
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: 'front',
      }}
    >
      <Drawer.Screen name="GroupHome" component={GroupStackNavigator} />
    </Drawer.Navigator>
  );
}

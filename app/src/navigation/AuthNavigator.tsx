import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { AuthStackParamList } from './types';
import { stackScreenOptions } from './screenOptions';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ConfirmEmailScreen from '../screens/ConfirmEmailScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  // Login has no header; Register and Verify Email do, and without the shared
  // options they fell back to the platform's white bar.
  return (
    <Stack.Navigator screenOptions={{ ...stackScreenOptions, headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: true, title: 'Register' }} />
      <Stack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} options={{ headerShown: true, title: 'Verify Email' }} />
    </Stack.Navigator>
  );
}

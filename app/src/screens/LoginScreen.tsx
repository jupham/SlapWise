import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { AuthService } from '../services/AuthService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';

type NavProp = NativeStackNavigationProp<AuthStackParamList>;

export default function LoginScreen() {
  const navigation = useNavigation<NavProp>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      await AuthService.login(email.trim(), password);
      const player = await AuthService.currentPlayer();
      const store = useStore.getState();
      store.setPlayer(player);

      const groups = await GroupService.getGroups();
      store.setGroups(groups);

      if (groups.length === 0) {
        // Navigate to root Welcome — need to use parent navigator
        navigation.getParent()?.reset({ index: 0, routes: [{ name: 'Welcome' }] });
      } else {
        store.setActiveGroup({ groupId: groups[0].groupId, groupName: groups[0].name });
        navigation.getParent()?.reset({ index: 0, routes: [{ name: 'App' }] });
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.message === 'INVALID_CREDENTIALS') {
        setError('Invalid email or password.');
      } else if (e.message === 'NOT_CONFIRMED') {
        try {
          const { resendSignUpCode } = await import('aws-amplify/auth');
          await resendSignUpCode({ username: email.trim() });
        } catch {
          // ignore resend errors
        }
        navigation.navigate('ConfirmEmail', { email: email.trim() });
      } else {
        setError(`Login failed: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Signing in...' : 'Sign In'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.link}
        onPress={() => navigation.navigate('Register')}
      >
        <Text style={styles.linkText}>Don't have an account? Register</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
  },
  error: {
    color: 'red',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 14,
  },
});

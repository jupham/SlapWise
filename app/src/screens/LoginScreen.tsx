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
import { color, radius, size, space, title } from '../theme';


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
        placeholderTextColor={color.textDim}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={color.textDim}
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
  container: { flex: 1, backgroundColor: color.bg, padding: space.xl, justifyContent: 'center' },
  title: { ...title, marginBottom: space.xl },
  subtitle: { fontSize: size.body, color: color.textMuted, marginTop: -space.md, marginBottom: space.xl },
  input: {
    backgroundColor: color.surface,
    borderWidth: 1, borderColor: color.border, borderRadius: radius.sm,
    paddingHorizontal: space.md, paddingVertical: space.md,
    marginBottom: space.md, fontSize: size.body, color: color.text,
  },
  error: { color: color.dangerText, marginBottom: space.md, fontSize: size.caption },
  success: { color: color.success, marginBottom: space.md, fontSize: size.caption },
  button: {
    backgroundColor: color.accent, borderRadius: radius.sm,
    paddingVertical: space.lg, alignItems: 'center', marginTop: space.sm,
  },
  buttonText: {
    color: color.accentInk, fontSize: size.body, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
  },
  link: { marginTop: space.xl, alignItems: 'center' },
  linkText: { color: color.textMuted, fontSize: size.caption },
  resend: { marginTop: space.xl, alignItems: 'center' },
  resendText: { color: color.textMuted, fontSize: size.caption },
});

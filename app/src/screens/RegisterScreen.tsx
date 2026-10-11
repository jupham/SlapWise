import React, { useRef, useState } from 'react';
import {
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';
import { AuthService } from '../services/AuthService';
import { color, radius, size, space, title } from '../theme';
import FormScroll from './components/FormScroll';


type NavProp = NativeStackNavigationProp<AuthStackParamList>;

export default function RegisterScreen() {
  const navigation = useNavigation<NavProp>();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  async function handleSubmit() {
    setError(null);

    if (!username.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required.');
      return;
    }
    if (username.trim().length < 2 || username.trim().length > 24) {
      setError('Display name must be between 2 and 24 characters.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await AuthService.register(email.trim(), password, username.trim());
      navigation.navigate('ConfirmEmail', { email: email.trim() });
    } catch (err: unknown) {
      const e = err as Error;
      console.error('Registration error:', JSON.stringify(err), e?.message, e?.name);
      if (e.message === 'EMAIL_TAKEN') {
        setError('An account with that email already exists.');
      } else {
        setError(`Registration failed: ${e.message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <FormScroll contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create Account</Text>

      <TextInput
        style={styles.input}
        placeholderTextColor={color.textDim}
        placeholder="Display name — what the group sees"
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={24}
        value={username}
        onChangeText={setUsername}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailRef.current?.focus()}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={color.textDim}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        ref={emailRef}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextInput
        style={styles.input}
        placeholderTextColor={color.textDim}
        placeholder="Password (min 8 chars, uppercase + number)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        ref={passwordRef}
        returnKeyType="go"
        onSubmitEditing={() => { if (!loading) void handleSubmit(); }}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <TouchableOpacity
        style={styles.button}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? 'Creating...' : 'Create Account'}
        </Text>
      </TouchableOpacity>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: color.bg, padding: space.xl, justifyContent: 'center' },
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

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import type { AuthStackParamList } from '../navigation/types';
import { color, font, label, radius, size, space, title } from '../theme';

type ConfirmEmailRouteProp = RouteProp<AuthStackParamList, 'ConfirmEmail'>;
type NavProp = NativeStackNavigationProp<AuthStackParamList, 'ConfirmEmail'>;

export default function ConfirmEmailScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<ConfirmEmailRouteProp>();
  const { email } = route.params;

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleConfirm() {
    setError(null);
    if (!code.trim()) {
      setError('Please enter the verification code.');
      return;
    }
    setLoading(true);
    try {
      await confirmSignUp({ username: email, confirmationCode: code.trim() });
      navigation.navigate('Login');
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e.name === 'CodeMismatchException') {
        setError('Incorrect code. Please try again.');
      } else if (e.name === 'ExpiredCodeException') {
        setError('Code has expired. Please request a new one.');
      } else {
        setError(e.message ?? 'Confirmation failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    try {
      await resendSignUpCode({ username: email });
      setResent(true);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message ?? 'Failed to resend code.');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>We sent a code to {email}</Text>

      <TextInput
        style={styles.input}
        placeholderTextColor={color.textDim}
        placeholder="Verification code"
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {resent ? <Text style={styles.success}>Code resent!</Text> : null}

      <TouchableOpacity style={styles.button} onPress={handleConfirm} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Verifying...' : 'Verify'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.resend} onPress={handleResend}>
        <Text style={styles.resendText}>Resend code</Text>
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

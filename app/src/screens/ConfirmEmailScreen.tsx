import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import type { AuthStackParamList } from '../navigation/types';

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
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 24 },
  input: {
    borderWidth: 1, borderColor: '#ccc', borderRadius: 8,
    padding: 12, marginBottom: 12, fontSize: 16,
  },
  error: { color: 'red', marginBottom: 12 },
  success: { color: 'green', marginBottom: 12 },
  button: {
    backgroundColor: '#007AFF', borderRadius: 8,
    padding: 14, alignItems: 'center', marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  resend: { marginTop: 16, alignItems: 'center' },
  resendText: { color: '#007AFF', fontSize: 14 },
});

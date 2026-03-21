import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen({ navigation }: Props) {
  const [groupId, setGroupId] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!groupId.trim() || !inviteCode.trim()) {
      setError('Group ID and invite code are required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await GroupService.joinGroup(groupId.trim(), inviteCode.trim().toUpperCase());
      navigation.goBack();
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e.message === 'INVALID_INVITE_CODE') {
        setError('Invalid or expired invite code');
      } else {
        setError(e.message ?? 'Failed to join group');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Group ID</Text>
      <TextInput
        style={styles.input}
        value={groupId}
        onChangeText={setGroupId}
        placeholder="Paste the group ID"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Text style={styles.label}>Invite Code</Text>
      <TextInput
        style={[styles.input, styles.codeInput]}
        value={inviteCode}
        onChangeText={(t) => setInviteCode(t.toUpperCase())}
        placeholder="e.g. A1B2C3D4"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        returnKeyType="done"
        onSubmitEditing={handleJoin}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={handleJoin} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Join</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  codeInput: { letterSpacing: 4, fontSize: 20, fontWeight: '700' },
  error: { color: 'red', marginBottom: 12, fontSize: 13 },
  btn: { backgroundColor: '#34C759', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});

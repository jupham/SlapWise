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
import type { GroupStackParamList } from '../navigation/types';
import { color } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen({ navigation }: Props) {
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      setError('Invite code is required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await GroupService.joinGroup(inviteCode.trim().toUpperCase());
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
      <Text style={styles.label}>Invite Code</Text>
      <TextInput
        style={styles.input}
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
  container: { flex: 1, backgroundColor: color.bg, padding: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: color.border, borderRadius: 8, padding: 12, fontSize: 20, letterSpacing: 4, fontWeight: '700', marginBottom: 16 },
  error: { color: 'red', marginBottom: 12, fontSize: 13 },
  btn: { backgroundColor: color.accent, padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 8 },
  btnText: { color: color.accentInk, fontWeight: '600', fontSize: 16 },
});

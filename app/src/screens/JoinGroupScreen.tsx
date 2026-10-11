import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { enterGroups } from '../navigation/enterGroups';
import type { GroupStackParamList } from '../navigation/types';
import { color, font, label, radius, size, space } from '../theme';
import FormScroll from './components/FormScroll';


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
      const joined = await GroupService.joinGroup(inviteCode.trim().toUpperCase());
      // Refetch and reset rather than goBack(): from Welcome, going back lands on
      // Welcome again, and neither path ever told the store about the new group.
      await enterGroups({ open: joined.groupId });
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
    <FormScroll contentContainerStyle={styles.container}>
      <Text style={styles.label}>Invite Code</Text>
      <TextInput
        style={styles.input}
        value={inviteCode}
        onChangeText={(t) => setInviteCode(t.toUpperCase())}
        placeholderTextColor={color.textDim}
        placeholder="e.g. A1B2C3D4"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        returnKeyType="done"
        onSubmitEditing={handleJoin}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.btn} onPress={handleJoin} disabled={loading}>
        {loading ? <ActivityIndicator color={color.accentInk} /> : <Text style={styles.btnText}>Join</Text>}
      </TouchableOpacity>
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: color.bg, padding: space.xl },
  label: { ...label, marginBottom: space.sm },
  input: {
    borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md,
    backgroundColor: color.surface, color: color.text,
    padding: space.md, fontSize: 22, letterSpacing: 4, fontFamily: font.condensed, marginBottom: space.md,
  },
  error: { color: color.dangerText, marginBottom: space.md, fontSize: size.caption },
  btn: {
    backgroundColor: color.accent, padding: space.md + 2, borderRadius: radius.sm,
    alignItems: 'center', marginTop: space.sm,
  },
  btnText: {
    color: color.accentInk, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});

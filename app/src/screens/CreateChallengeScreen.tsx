import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getCurrentUser } from 'aws-amplify/auth';
import { GroupService } from '../services/GroupService';
import { ManchesterService } from '../services/ManchesterService';
import { Member } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateChallenge'>;

export default function CreateChallengeScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [statement, setStatement] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ member?: string; statement?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, data] = await Promise.all([
        getCurrentUser(),
        GroupService.getGroupMembers(groupId),
      ]);
      setCurrentUserId(user.userId);
      // Exclude self from picker
      setMembers(data.filter((m) => m.playerId !== user.userId));
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (!selectedMemberId) errs.member = 'Select a statement maker';
    if (!statement.trim()) errs.statement = 'Statement is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      await ManchesterService.createChallenge(groupId, selectedMemberId!, statement.trim());
      Alert.alert('Manchester!', 'Challenge recorded.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create challenge';
      if (msg.includes('SELF_CHALLENGE_ERROR')) {
        setErrors({ member: 'You cannot challenge yourself' });
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Manchester — {groupName}</Text>

      <Text style={styles.label}>Statement Maker</Text>
      {errors.member && <Text style={styles.error}>{errors.member}</Text>}
      <FlatList
        data={members}
        keyExtractor={(m) => m.playerId}
        style={styles.memberList}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.memberRow, selectedMemberId === item.playerId && styles.memberRowSelected]}
            onPress={() => {
              setSelectedMemberId(item.playerId);
              setErrors((e) => ({ ...e, member: undefined }));
            }}
          >
            <Text style={[styles.memberName, selectedMemberId === item.playerId && styles.memberNameSelected]}>
              {item.playerId}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No other members in this group</Text>}
      />

      <Text style={styles.label}>Statement</Text>
      {errors.statement && <Text style={styles.error}>{errors.statement}</Text>}
      <TextInput
        style={[styles.input, errors.statement ? styles.inputError : null]}
        placeholder="What did they say?"
        value={statement}
        onChangeText={(t) => {
          setStatement(t);
          setErrors((e) => ({ ...e, statement: undefined }));
        }}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={[styles.btn, submitting && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.btnText}>{submitting ? 'Submitting…' : 'Call Manchester!'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  error: { color: '#FF3B30', fontSize: 13, marginBottom: 4 },
  memberList: { maxHeight: 200, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 16 },
  memberRow: { padding: 12, borderBottomWidth: 1, borderColor: '#eee' },
  memberRowSelected: { backgroundColor: '#007AFF' },
  memberName: { fontSize: 15 },
  memberNameSelected: { color: '#fff', fontWeight: '600' },
  empty: { padding: 16, color: '#aaa', textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, fontSize: 15, marginBottom: 20, minHeight: 80,
  },
  inputError: { borderColor: '#FF3B30' },
  btn: { backgroundColor: '#FF3B30', padding: 16, borderRadius: 8, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

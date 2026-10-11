import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { getCurrentUser } from 'aws-amplify/auth';
import { GroupService } from '../services/GroupService';
import { ManchesterService } from '../services/ManchesterService';
import { Member } from '../types';
import type { GroupStackParamList } from '../navigation/types';

import { color, label, radius, size, space, title } from '../theme';
import FormScroll from './components/FormScroll';


type Props = NativeStackScreenProps<GroupStackParamList, 'CreateChallenge'>;

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
      console.error('[CreateChallengeScreen] createChallenge failed:', e);
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

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  return (
    <FormScroll contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Manchester — {groupName}</Text>

      <Text style={styles.label}>Statement Maker</Text>
      {errors.member && <Text style={styles.error}>{errors.member}</Text>}
      {/* A plain map rather than a FlatList: the screen is now a ScrollView, and
          a virtualized list nested inside one breaks windowing. A group's
          member list is short enough not to need it. */}
      <ScrollView style={styles.memberList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {members.length === 0 ? (
          <Text style={styles.empty}>No other members in this group</Text>
        ) : (
          members.map((item) => (
            <TouchableOpacity
              key={item.playerId}
              style={[styles.memberRow, selectedMemberId === item.playerId && styles.memberRowSelected]}
              onPress={() => {
                setSelectedMemberId(item.playerId);
                setErrors((e) => ({ ...e, member: undefined }));
              }}
            >
              <Text style={[styles.memberName, selectedMemberId === item.playerId && styles.memberNameSelected]}>
                {item.username ?? item.playerId}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <Text style={styles.label}>Statement</Text>
      {errors.statement && <Text style={styles.error}>{errors.statement}</Text>}
      <TextInput
        style={[styles.input, errors.statement ? styles.inputError : null]}
        placeholder="What did they say?"
        placeholderTextColor={color.textDim}
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
    </FormScroll>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: color.bg, padding: space.lg },
  center: { flex: 1, backgroundColor: color.bg },
  heading: { ...title, fontSize: size.title, marginBottom: space.xl },
  label: { ...label, marginBottom: space.xs },
  error: { color: color.dangerText, fontSize: size.caption, marginBottom: space.xs },
  memberList: {
    maxHeight: 200, borderWidth: 1, borderColor: color.border,
    borderRadius: radius.md, marginBottom: space.lg,
  },
  memberRow: { padding: space.md, borderBottomWidth: 1, borderColor: color.border },
  memberRowSelected: { backgroundColor: color.accent },
  memberName: { fontSize: size.body, color: color.text },
  memberNameSelected: { color: color.accentInk, fontWeight: '600' },
  empty: { padding: space.lg, color: color.textDim, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: color.borderStrong, borderRadius: radius.md,
    backgroundColor: color.surface, color: color.text,
    padding: space.md, fontSize: size.body, marginBottom: space.xl, minHeight: 80,
  },
  inputError: { borderColor: color.dangerText },
  btn: { backgroundColor: color.accent, paddingVertical: space.md + 2, borderRadius: radius.sm, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  btnText: {
    color: color.accentInk, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});

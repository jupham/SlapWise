import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { ManchesterService } from '../services/ManchesterService';
import { useStore } from '../store';
import { Member } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordGameCall'>;

export default function RecordGameCallScreen({ route, navigation }: Props) {
  const { groupId } = route.params;
  const player = useStore((s) => s.player);
  const currentPlayerId = player?.playerId ?? '';

  const [members, setMembers] = useState<Member[]>([]);
  const [callerId, setCallerId] = useState<string>('');
  const [chuggedIds, setChuggedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await GroupService.getGroupMembers(groupId);
      setMembers(data);
      // Default caller to current player
      setCallerId(currentPlayerId);
    } catch (e) {
      console.error('[RecordGameCallScreen] load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [groupId, currentPlayerId]);

  useEffect(() => { void load(); }, [load]);

  const toggleChugged = (playerId: string) => {
    setChuggedIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!callerId) {
      Alert.alert('Validation', 'Select who called game');
      return;
    }
    if (chuggedIds.size === 0) {
      Alert.alert('Validation', 'Select at least one player who had to drink');
      return;
    }

    setSubmitting(true);
    try {
      await ManchesterService.recordGameCall(groupId, callerId, [...chuggedIds]);
      navigation.goBack();
    } catch (e) {
      console.error('[RecordGameCallScreen] submit failed:', e);
      Alert.alert('Error', 'Failed to record game call');
    } finally {
      setSubmitting(false);
    }
  };

  const nameFor = (m: Member) => m.username ?? m.playerId;

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Who called game?</Text>
      {members.map((m) => (
        <TouchableOpacity
          key={m.playerId}
          style={[styles.option, callerId === m.playerId && styles.optionSelected]}
          onPress={() => setCallerId(m.playerId)}
        >
          <Text style={[styles.optionText, callerId === m.playerId && styles.optionTextSelected]}>
            {nameFor(m)}{m.playerId === currentPlayerId ? ' (you)' : ''}
          </Text>
        </TouchableOpacity>
      ))}

      <Text style={[styles.label, { marginTop: 24 }]}>Who had to drink?</Text>
      <Text style={styles.hint}>Select all that apply</Text>
      {members.map((m) => (
        <TouchableOpacity
          key={m.playerId}
          style={[styles.option, chuggedIds.has(m.playerId) && styles.optionSelected]}
          onPress={() => toggleChugged(m.playerId)}
        >
          <Text style={[styles.optionText, chuggedIds.has(m.playerId) && styles.optionTextSelected]}>
            {nameFor(m)}{m.playerId === currentPlayerId ? ' (you)' : ''}
          </Text>
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={[styles.submitBtn, submitting && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitBtnText}>{submitting ? 'Recording…' : 'Record Game Call'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 8 },
  hint: { fontSize: 12, color: '#888', marginBottom: 8 },
  option: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    padding: 12, marginBottom: 8, backgroundColor: '#fafafa',
  },
  optionSelected: { borderColor: '#007AFF', backgroundColor: '#EAF4FF' },
  optionText: { fontSize: 15, color: '#333' },
  optionTextSelected: { color: '#007AFF', fontWeight: '600' },
  submitBtn: {
    marginTop: 32, backgroundColor: '#FF3B30',
    padding: 16, borderRadius: 10, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

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
import type { GroupStackParamList } from '../navigation/types';
import { color } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'RecordGameCall'>;

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
      // Only show read-in players
      setMembers(data.filter((m) => m.isReadIn));
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

  // Gate: current player must be read-in to record a game call
  const currentMember = members.find((m) => m.playerId === currentPlayerId);
  const isCurrentPlayerReadIn = currentMember?.isReadIn ?? false;

  if (!isCurrentPlayerReadIn) {
    return (
      <View style={styles.gateContainer}>
        <Text style={styles.gateText}>You must be read in to record a game call.</Text>
      </View>
    );
  }

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
  container: { flex: 1, backgroundColor: color.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1 },
  gateContainer: { flex: 1, backgroundColor: color.bg, padding: 24, justifyContent: 'center', alignItems: 'center' },
  gateText: { fontSize: 16, color: color.textMuted, textAlign: 'center' },
  label: { fontSize: 16, fontWeight: '700', color: color.text, marginBottom: 8 },
  hint: { fontSize: 12, color: color.textMuted, marginBottom: 8 },
  option: {
    borderWidth: 1, borderColor: color.border, borderRadius: 8,
    padding: 12, marginBottom: 8, backgroundColor: color.surface,
  },
  optionSelected: { borderColor: color.accent, backgroundColor: color.surfaceRaised },
  optionText: { fontSize: 15, color: color.text },
  optionTextSelected: { color: color.accent, fontWeight: '600' },
  submitBtn: {
    marginTop: 32, backgroundColor: color.accent,
    padding: 16, borderRadius: 10, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  submitBtnText: { color: color.accentInk, fontWeight: '700', fontSize: 16 },
});

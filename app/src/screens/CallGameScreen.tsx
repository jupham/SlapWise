import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GameService } from '../services/GameService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { Member } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { gameName } from '../copy/game';
import { color, displayName, label, radius, size, space } from '../theme';

type Props = NativeStackScreenProps<GroupStackParamList, 'CallGame'>;

/**
 * Calling the read-in game: pick who you are calling out. Only other read-in
 * players are offered — the server rejects anyone else anyway — and you cannot
 * call yourself. Nothing about covered or not is decided here; each player
 * called answers for themselves on the call screen.
 */
export default function CallGameScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const player = useStore((s) => s.player);
  const me = player?.playerId ?? '';

  const [candidates, setCandidates] = useState<Member[]>([]);
  const [title, setTitle] = useState('Game');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [members, group] = await Promise.all([
        GroupService.getGroupMembers(groupId),
        GroupService.getGroup(groupId),
      ]);
      setCandidates(members.filter((m) => m.isReadIn && m.playerId !== me));
      setTitle(gameName(group.readInGameName));
    } catch (e) {
      console.error('[CallGameScreen] load failed:', e);
      setError('Failed to load players');
    } finally {
      setLoading(false);
    }
  }, [groupId, me]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    navigation.setOptions({ title: `Call ${title}` });
  }, [navigation, title]);

  const toggle = (id: string) => {
    setError(null);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCall = async () => {
    if (picked.size === 0) {
      setError('Pick at least one player to call out');
      return;
    }
    setSubmitting(true);
    try {
      const call = await GameService.callGame(groupId, [...picked]);
      navigation.replace('GameCall', { groupId, groupName, callId: call.callId });
    } catch (e) {
      console.error('[CallGameScreen] callGame failed:', e);
      setError('Failed to make the call');
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Who are you calling out?</Text>
      <Text style={styles.hint}>
        Anyone you call who wasn't covered drinks. If anyone you call was covered, you drink too.
      </Text>
      <TouchableOpacity onPress={() => navigation.navigate('GameRules', { groupId, groupName })}>
        <Text style={styles.rulesLink}>Rules →</Text>
      </TouchableOpacity>

      <FlatList
        data={candidates}
        keyExtractor={(m) => m.playerId}
        style={styles.list}
        renderItem={({ item }) => {
          const on = picked.has(item.playerId);
          return (
            <TouchableOpacity
              style={[styles.row, on && styles.rowOn]}
              onPress={() => toggle(item.playerId)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Text style={[styles.rowName, on && styles.rowNameOn]}>
                {displayName(item.username ?? item.playerId)}
              </Text>
              <Text style={[styles.check, on && styles.rowNameOn]}>{on ? 'Called' : ''}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>Nobody else is read in yet. You need someone to call.</Text>
        }
      />

      {error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity
        style={[styles.btn, (submitting || candidates.length === 0) && styles.btnDisabled]}
        onPress={handleCall}
        disabled={submitting || candidates.length === 0}
      >
        {submitting ? (
          <ActivityIndicator color={color.text} />
        ) : (
          <Text style={styles.btnText}>
            {picked.size > 1 ? `Call ${picked.size} players` : 'Make the call'}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg, padding: space.lg },
  center: { flex: 1, backgroundColor: color.bg },
  label: { ...label, marginBottom: space.xs },
  hint: { fontSize: size.caption, color: color.textMuted, marginBottom: space.sm, lineHeight: 18 },
  rulesLink: { ...label, color: color.regalia, marginBottom: space.lg },
  list: { flexGrow: 0, marginBottom: space.lg },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: space.md, paddingHorizontal: space.md,
    borderBottomWidth: 1, borderBottomColor: color.border,
  },
  // Regalia rather than orange: the game is the purple half of the app.
  rowOn: { backgroundColor: color.regalia },
  rowName: { fontSize: size.body, color: color.text },
  rowNameOn: { color: color.text, fontWeight: '700' },
  check: { ...label, color: color.textMuted },
  empty: { padding: space.lg, color: color.textDim, textAlign: 'center', fontSize: size.body },
  error: { color: color.dangerText, fontSize: size.caption, marginBottom: space.md },
  btn: {
    backgroundColor: color.regalia, paddingVertical: space.md + 2,
    borderRadius: radius.sm, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: color.text, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GroupService } from '../services/GroupService';
import { ManchesterService } from '../services/ManchesterService';
import { useStore } from '../store';
import { SlapDebt } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { color, size, space } from '../theme';


type Props = NativeStackScreenProps<GroupStackParamList, 'PendingDebts'>;

export default function PendingDebtsScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const player = useStore((s) => s.player);
  const currentPlayerId = player?.playerId ?? '';
  const [debts, setDebts] = useState<SlapDebt[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, pendingConf, members] = await Promise.all([
        ManchesterService.getDebtsByStatus(groupId, 'pending'),
        ManchesterService.getDebtsByStatus(groupId, 'pending_confirmation'),
        GroupService.getGroupMembers(groupId),
      ]);
      setDebts([...pending, ...pendingConf]);
      const nameMap: Record<string, string> = {};
      for (const m of members) nameMap[m.playerId] = m.username ?? m.playerId;
      setMemberNames(nameMap);
    } catch (err) {
      console.error('[PendingDebtsScreen] load failed:', err);
      setError('Failed to load pending challenges');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();

    // Subscribe to real-time debt updates
    subRef.current = ManchesterService.subscribeToDebtUpdates(groupId, (debt) => {
      setDebts((prev) => {
        if (debt.status === 'resolved' || debt.status === 'delivered') {
          return prev.filter((d) => d.debtId !== debt.debtId);
        }
        const idx = prev.findIndex((d) => d.debtId === debt.debtId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = debt;
          return updated;
        }
        return [debt, ...prev];
      });
    });

    return () => { subRef.current?.unsubscribe(); };
  }, [groupId, load]);

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Pending Challenges — {groupName}</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={debts}
        keyExtractor={(d) => d.debtId}
        renderItem={({ item }) => {
          const challengerOutcome = item.challengerConfirmation?.outcome ?? null;
          const statementMakerOutcome = item.statementMakerConfirmation?.outcome ?? null;

          const outcomeLabel = (outcome: string | null) => {
            if (outcome === 'followed_through') return { text: 'Yes', color: color.success };
            if (outcome === 'did_not_follow_through') return { text: 'No', color: color.accent };
            return { text: 'No answer yet', color: color.textDim };
          };

          const nameFor = (id: string | null | undefined) => {
            if (!id) return 'Unknown';
            const name = memberNames[id] ?? id;
            return id === currentPlayerId ? `${name} (you)` : name;
          };

          const challengerName = nameFor(item.challengerId);
          const statementMakerName = nameFor(item.statementMakerId);
          const challengerStatus = outcomeLabel(challengerOutcome);
          const statementMakerStatus = outcomeLabel(statementMakerOutcome);

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('ResolutionConfirmation', { debtId: item.debtId, groupId, groupName })}
            >
              {/* Header */}
              <View style={styles.cardHeader}>
                <Text style={styles.badge}>MANCHESTER</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>

              {/* Statement */}
              <Text style={styles.statement}>"{item.statement}"</Text>
              <Text style={styles.statementBy}>— {statementMakerName}</Text>

              {/* Who called it */}
              <Text style={styles.calledBy}>{challengerName} called Manchester</Text>

              <Text style={styles.confirmQuestion}>Did {statementMakerName} follow through?</Text>
              <View style={styles.confirmRow}>
                <View style={[styles.confirmCol, styles.confirmColLeft]}>
                  <Text style={styles.confirmName} numberOfLines={1}>{challengerName} said</Text>
                  <Text style={[styles.confirmOutcome, { color: challengerStatus.color }]}>
                    {challengerStatus.text}
                  </Text>
                </View>
                <View style={styles.confirmDivider} />
                <View style={styles.confirmCol}>
                  <Text style={styles.confirmName} numberOfLines={1}>{statementMakerName} said</Text>
                  <Text style={[styles.confirmOutcome, { color: statementMakerStatus.color }]}>
                    {statementMakerStatus.text}
                  </Text>
                </View>
              </View>

              <Text style={styles.tapHint}>Tap to respond →</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No pending challenges</Text>}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateChallenge', { groupId, groupName })}
      >
        <Text style={styles.fabText}>+ Manchester</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg, padding: 16 },
  center: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  error: { color: color.dangerText, marginBottom: space.sm },
  card: {
    borderWidth: 1, borderColor: color.border, borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: color.surface,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  badge: {
    backgroundColor: color.accent, color: color.accentInk, fontSize: 9, letterSpacing: 1.2,
    fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  date: { fontSize: 12, color: color.textMuted },
  statement: { fontSize: 15, fontStyle: 'italic', color: color.text },
  statementBy: { fontSize: 13, color: color.textMuted, marginTop: 2, marginBottom: 10 },
  calledBy: { fontSize: 13, color: color.textMuted, marginBottom: 12 },
  confirmQuestion: { fontSize: size.caption, color: color.textMuted, marginBottom: space.sm },
  confirmRow: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: color.border, borderRadius: 8,
    overflow: 'hidden', marginBottom: 8,
  },
  confirmCol: { flex: 1, padding: 10 },
  confirmColLeft: { borderRightWidth: 1, borderRightColor: color.border },
  confirmDivider: { width: 0 },
  confirmName: { fontSize: 12, color: color.textMuted, marginBottom: 3 },
  confirmOutcome: { fontSize: 12, fontWeight: '700' },
  tapHint: { fontSize: 11, color: color.accent, textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 40, color: color.textDim },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: color.accent, paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 30, elevation: 4, shadowColor: color.bg, shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
  },
  fabText: { color: color.accentInk, fontWeight: '700', fontSize: 15 },
});

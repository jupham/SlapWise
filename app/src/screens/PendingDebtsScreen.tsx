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
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PendingDebts'>;

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
            if (outcome === 'followed_through') return { text: '✓ Followed Through', color: '#34C759' };
            if (outcome === 'did_not_follow_through') return { text: '✗ Did Not Follow Through', color: '#FF3B30' };
            return { text: '— Pending', color: '#aaa' };
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

              {/* Side-by-side confirmations */}
              <View style={styles.confirmRow}>
                <View style={[styles.confirmCol, styles.confirmColLeft]}>
                  <Text style={styles.confirmName} numberOfLines={1}>{challengerName}</Text>
                  <Text style={[styles.confirmOutcome, { color: challengerStatus.color }]}>
                    {challengerStatus.text}
                  </Text>
                </View>
                <View style={styles.confirmDivider} />
                <View style={styles.confirmCol}>
                  <Text style={styles.confirmName} numberOfLines={1}>{statementMakerName}</Text>
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
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  error: { color: '#FF3B30', marginBottom: 8 },
  card: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: '#fafafa',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  badge: {
    backgroundColor: '#FF3B30', color: '#fff', fontSize: 11,
    fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  date: { fontSize: 12, color: '#888' },
  statement: { fontSize: 15, fontStyle: 'italic', color: '#333' },
  statementBy: { fontSize: 13, color: '#666', marginTop: 2, marginBottom: 10 },
  calledBy: { fontSize: 13, color: '#555', marginBottom: 12 },
  confirmRow: {
    flexDirection: 'row',
    borderWidth: 1, borderColor: '#eee', borderRadius: 8,
    overflow: 'hidden', marginBottom: 8,
  },
  confirmCol: { flex: 1, padding: 10 },
  confirmColLeft: { borderRightWidth: 1, borderRightColor: '#eee' },
  confirmDivider: { width: 0 },
  confirmName: { fontSize: 12, color: '#888', marginBottom: 3 },
  confirmOutcome: { fontSize: 12, fontWeight: '700' },
  tapHint: { fontSize: 11, color: '#007AFF', textAlign: 'right' },
  empty: { textAlign: 'center', marginTop: 40, color: '#aaa' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#FF3B30', paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 30, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

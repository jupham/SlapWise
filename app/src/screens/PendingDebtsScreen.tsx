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
import { ManchesterService } from '../services/ManchesterService';
import { SlapDebt } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PendingDebts'>;

export default function PendingDebtsScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const [debts, setDebts] = useState<SlapDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await ManchesterService.getPendingDebts(groupId);
      setDebts(data);
    } catch {
      setError('Failed to load pending challenges');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();

    // Subscribe to real-time debt updates
    subRef.current = ManchesterService.subscribeToPendingDebts(groupId, (debt) => {
      setDebts((prev) => {
        if (debt.status !== 'pending') {
          // Remove debts that are no longer pending
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
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.badge}>MANCHESTER</Text>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.statement}>"{item.statement}"</Text>
            <View style={styles.parties}>
              <Text style={styles.partyLabel}>Challenger</Text>
              <Text style={styles.partyId}>{item.challengerId}</Text>
            </View>
            <View style={styles.parties}>
              <Text style={styles.partyLabel}>Statement Maker</Text>
              <Text style={styles.partyId}>{item.statementMakerId}</Text>
            </View>
          </View>
        )}
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
  statement: { fontSize: 15, fontStyle: 'italic', marginBottom: 10, color: '#333' },
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  partyLabel: { fontSize: 12, color: '#888' },
  partyId: { fontSize: 12, fontWeight: '600', color: '#333' },
  empty: { textAlign: 'center', marginTop: 40, color: '#aaa' },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#FF3B30', paddingHorizontal: 20, paddingVertical: 14,
    borderRadius: 30, elevation: 4, shadowColor: '#000', shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 }, shadowRadius: 4,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

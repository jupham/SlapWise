import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ManchesterService } from '../services/ManchesterService';
import { useStore } from '../store';
import { SlapDebt, DebtStatus, GameType } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Ledger'>;

const GAME_TYPE_FILTERS: Array<{ label: string; value: GameType | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Manchester', value: 'manchester' },
  { label: 'Read In', value: 'read_in' },
];

const STATUS_FILTERS: Array<{ label: string; value: DebtStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'Pending Confirmation', value: 'pending_confirmation' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Delivered', value: 'delivered' },
];

export default function LedgerScreen({ route }: Props) {
  const { groupId } = route.params;

  const player = useStore((s) => s.player);
  const members = useStore((s) => s.members);
  const setDebts = useStore((s) => s.setDebts);

  const [debts, setLocalDebts] = useState<SlapDebt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const [gameTypeFilter, setGameTypeFilter] = useState<GameType | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<DebtStatus | undefined>(undefined);

  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  const usernameFor = useCallback(
    (playerId: string | null): string => {
      if (!playerId) return 'Unknown';
      return members.find((m) => m.playerId === playerId)?.username ?? playerId;
    },
    [members]
  );

  const loadDebts = useCallback(async () => {
    setError(null);
    try {
      // getDebts accepts an optional status filter; game type filtering is client-side
      const data = await ManchesterService.getDebtsByStatus(
        groupId,
        statusFilter ?? 'pending' // default to pending if no status selected
      );
      const filtered = gameTypeFilter ? data.filter((d) => d.gameType === gameTypeFilter) : data;
      setLocalDebts(filtered);
      setDebts(filtered);
    } catch (err) {
      console.error('[LedgerScreen] loadDebts:', err);
      setError('Failed to load debts');
    }
  }, [groupId, gameTypeFilter, statusFilter, setDebts]);

  // When no status filter is selected, load all statuses
  const loadAllDebts = useCallback(async () => {
    setError(null);
    try {
      const statuses: DebtStatus[] = ['pending', 'pending_confirmation', 'resolved', 'delivered'];
      const results = await Promise.all(
        statuses.map((s) => ManchesterService.getDebtsByStatus(groupId, s))
      );
      const all = results.flat();
      const filtered = gameTypeFilter ? all.filter((d) => d.gameType === gameTypeFilter) : all;
      setLocalDebts(filtered);
      setDebts(filtered);
    } catch (err) {
      console.error('[LedgerScreen] loadAllDebts:', err);
      setError('Failed to load debts');
    }
  }, [groupId, gameTypeFilter, setDebts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (statusFilter) {
        await loadDebts();
      } else {
        await loadAllDebts();
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, loadDebts, loadAllDebts]);

  useEffect(() => {
    void load();

    subRef.current = ManchesterService.subscribeToDebtUpdates(groupId, (debt) => {
      setLocalDebts((prev) => {
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

  // Re-fetch when filters change (after initial load)
  useEffect(() => {
    if (!loading) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameTypeFilter, statusFilter]);

  const handleConfirmDelivery = async (debtId: string) => {
    setConfirming(debtId);
    try {
      await ManchesterService.confirmDelivery(debtId, groupId);
      await load();
    } catch (err) {
      console.error('[LedgerScreen] confirmDelivery:', err);
      setError('Failed to confirm delivery');
    } finally {
      setConfirming(null);
    }
  };

  const currentPlayerId = player?.playerId ?? '';

  const renderDebt = ({ item }: { item: SlapDebt }) => {
    const isDebtor = item.debtorId === currentPlayerId;
    const isCreditor = item.creditorId === currentPlayerId;
    const canConfirm = item.status === 'resolved' && (isDebtor || isCreditor);
    const alreadyConfirmed =
      (isDebtor && item.debtorDeliveryConfirmed) ||
      (isCreditor && item.creditorDeliveryConfirmed);

    const gameLabel = item.gameType === 'manchester' ? 'MANCHESTER' : 'READ IN';
    const statusLabel = item.status.replace(/_/g, ' ').toUpperCase();

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.badges}>
            <Text style={styles.gameBadge}>{gameLabel}</Text>
            <Text style={[styles.statusBadge, statusBadgeStyle(item.status)]}>{statusLabel}</Text>
          </View>
          {item.resolvedAt && (
            <Text style={styles.date}>{new Date(item.resolvedAt).toLocaleDateString()}</Text>
          )}
        </View>

        <Text style={styles.statement}>"{item.statement}"</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Challenger</Text>
          <Text style={styles.value}>{usernameFor(item.challengerId)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Statement Maker</Text>
          <Text style={styles.value}>{usernameFor(item.statementMakerId)}</Text>
        </View>
        {item.debtorId && (
          <View style={styles.row}>
            <Text style={styles.label}>Debtor</Text>
            <Text style={styles.value}>{usernameFor(item.debtorId)}</Text>
          </View>
        )}
        {item.creditorId && (
          <View style={styles.row}>
            <Text style={styles.label}>Creditor</Text>
            <Text style={styles.value}>{usernameFor(item.creditorId)}</Text>
          </View>
        )}
        {item.debtPunishment && (
          <View style={styles.row}>
            <Text style={styles.label}>Punishment</Text>
            <Text style={styles.value}>
              {item.debtPunishment === 'slap' ? 'Slap' : 'Infinity Grog'}
            </Text>
          </View>
        )}

        {canConfirm && !alreadyConfirmed && (
          <TouchableOpacity
            style={[styles.confirmBtn, confirming === item.debtId && styles.btnDisabled]}
            onPress={() => handleConfirmDelivery(item.debtId)}
            disabled={confirming === item.debtId}
          >
            {confirming === item.debtId ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.confirmBtnText}>Confirm Delivery</Text>
            )}
          </TouchableOpacity>
        )}

        {alreadyConfirmed && item.status === 'resolved' && (
          <Text style={styles.confirmedText}>✓ You confirmed delivery</Text>
        )}
      </View>
    );
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {GAME_TYPE_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.chip, gameTypeFilter === f.value && styles.chipActive]}
            onPress={() => setGameTypeFilter(f.value)}
          >
            <Text style={[styles.chipText, gameTypeFilter === f.value && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.chipDivider} />
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.label}
            style={[styles.chip, statusFilter === f.value && styles.chipActive]}
            onPress={() => setStatusFilter(f.value)}
          >
            <Text style={[styles.chipText, statusFilter === f.value && styles.chipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={debts}
        keyExtractor={(d) => d.debtId}
        renderItem={renderDebt}
        ListEmptyComponent={<Text style={styles.empty}>No debts found</Text>}
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

function statusBadgeStyle(status: DebtStatus) {
  switch (status) {
    case 'resolved': return { backgroundColor: '#34C759' };
    case 'delivered': return { backgroundColor: '#007AFF' };
    case 'pending_confirmation': return { backgroundColor: '#FFCC00' };
    default: return { backgroundColor: '#FF3B30' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1 },
  error: { color: '#FF3B30', marginHorizontal: 16, marginTop: 8 },
  filterBar: { maxHeight: 48, borderBottomWidth: 1, borderBottomColor: '#eee' },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: '#ddd', marginRight: 8, backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  chipText: { fontSize: 12, color: '#555' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  chipDivider: { width: 1, height: 24, backgroundColor: '#ddd', marginRight: 8 },
  listContent: { padding: 16 },
  card: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: '#fafafa',
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginBottom: 8, alignItems: 'flex-start',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  gameBadge: {
    backgroundColor: '#FF3B30', color: '#fff', fontSize: 11,
    fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  statusBadge: {
    color: '#fff', fontSize: 11, fontWeight: '700',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  date: { fontSize: 12, color: '#888' },
  statement: { fontSize: 14, fontStyle: 'italic', marginBottom: 10, color: '#333' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  label: { fontSize: 12, color: '#888' },
  value: { fontSize: 12, fontWeight: '600', color: '#333' },
  confirmBtn: {
    marginTop: 12, backgroundColor: '#007AFF', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  confirmedText: { marginTop: 10, fontSize: 13, color: '#34C759', fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 40, color: '#aaa' },
});

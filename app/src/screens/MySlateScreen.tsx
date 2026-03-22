import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ManchesterService } from '../services/ManchesterService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { PlayerDebtIndex } from '../types';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'MySlate'>;

type Section = {
  title: string;
  data: PlayerDebtIndex[];
  emptyText: string;
};

const PUNISHMENT_LABEL: Record<string, string> = {
  slap: '👋 Slap',
  infinity_grog: '🍺 Infinity Grog',
};

export default function MySlateScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;
  const player = useStore((s) => s.player);
  const currentPlayerId = player?.playerId ?? '';

  const [debts, setDebts] = useState<PlayerDebtIndex[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Single GSI4 query — all denormalized fields, no second fetch needed
      const [myDebts, members] = await Promise.all([
        ManchesterService.getMyDebts(groupId),
        GroupService.getGroupMembers(groupId),
      ]);

      const nameMap: Record<string, string> = {};
      for (const m of members) nameMap[m.playerId] = m.username ?? m.playerId;
      setMemberNames(nameMap);
      setDebts(myDebts);
    } catch (e) {
      console.error('[MySlateScreen] load failed:', e);
      setError('Failed to load your slate');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => { void load(); }, [load]);

  const nameFor = (id: string | null | undefined) => {
    if (!id) return 'Unknown';
    const name = memberNames[id] ?? id;
    return id === currentPlayerId ? `${name} (you)` : name;
  };

  // Needs Action: it's your turn to do something
  const needsAction = debts.filter((d) => {
    if (d.status === 'pending') return true; // hasn't submitted yet
    if (d.status === 'pending_confirmation') return true; // waiting to agree
    if (d.status === 'resolved' && (d.debtorId === currentPlayerId || d.creditorId === currentPlayerId)) {
      // Delivery confirmation needed
      return true;
    }
    return false;
  });

  // Waiting: involved but waiting on the other party
  // pending_confirmation where you already submitted = waiting
  // resolved where neither has confirmed delivery yet = waiting
  // This is a subset of needsAction so we separate by checking who's acted
  // For simplicity: pending_confirmation is both "needs action" and "waiting" depending on who submitted first
  // We show it under Needs Action always since the second party still needs to act

  // Outstanding Punishments: resolved, you are debtor or creditor, not yet delivered
  const outstanding = debts.filter(
    (d) => d.status === 'resolved'
  );

  // History: delivered
  const history = debts.filter((d) => d.status === 'delivered');

  // Waiting: pending_confirmation where you've already submitted (other party hasn't)
  // We can't know this from GSI4 alone without the confirmation fields, so we show
  // pending_confirmation under Needs Action for now (both parties see it there)

  const sections: Section[] = [
    {
      title: 'Needs Action',
      data: debts.filter((d) => d.status === 'pending' || d.status === 'pending_confirmation'),
      emptyText: "You're all caught up",
    },
    {
      title: 'Outstanding Punishments',
      data: outstanding,
      emptyText: 'Nothing outstanding',
    },
    {
      title: 'History',
      data: history,
      emptyText: 'No history yet',
    },
  ];

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(d) => d.debtId}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 ? (
            <Text style={styles.empty}>{section.emptyText}</Text>
          ) : null
        }
        renderItem={({ item, section }) => {
          const isActive = section.title === 'Needs Action';
          const isOutstanding = section.title === 'Outstanding Punishments';
          const isDebtor = item.debtorId === currentPlayerId;
          const isCreditor = item.creditorId === currentPlayerId;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {
                if (isActive) {
                  navigation.navigate('ResolutionConfirmation', {
                    debtId: item.debtId,
                    groupId,
                    groupName,
                  });
                }
              }}
              activeOpacity={isActive ? 0.7 : 1}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.badge}>MANCHESTER</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>

              <Text style={styles.statement}>"{item.statement}"</Text>
              <Text style={styles.attribution}>— {nameFor(item.statementMakerId)}</Text>
              <Text style={styles.calledBy}>{nameFor(item.challengerId)} called Manchester</Text>

              {isOutstanding && item.debtPunishment && (
                <View style={[styles.punishmentBanner, isDebtor ? styles.owesBanner : styles.owedBanner]}>
                  <Text style={styles.punishmentText}>
                    {isDebtor
                      ? `You owe ${nameFor(item.creditorId)}: ${PUNISHMENT_LABEL[item.debtPunishment] ?? item.debtPunishment}`
                      : `${nameFor(item.debtorId)} owes you: ${PUNISHMENT_LABEL[item.debtPunishment] ?? item.debtPunishment}`}
                  </Text>
                </View>
              )}

              {section.title === 'History' && item.debtPunishment && (
                <Text style={styles.deliveredText}>
                  ✓ {isDebtor || isCreditor
                    ? `${nameFor(item.debtorId)} paid ${nameFor(item.creditorId)} — ${PUNISHMENT_LABEL[item.debtPunishment] ?? item.debtPunishment}`
                    : 'Delivered'}
                </Text>
              )}

              {isActive && (
                <Text style={styles.tapHint}>Tap to respond →</Text>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  error: { color: '#FF3B30', margin: 16 },
  sectionHeader: {
    fontSize: 16, fontWeight: '700', color: '#333',
    marginTop: 20, marginBottom: 8,
  },
  empty: { fontSize: 13, color: '#aaa', marginBottom: 12 },
  card: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: '#fafafa',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  badge: {
    backgroundColor: '#FF3B30', color: '#fff', fontSize: 11,
    fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  date: { fontSize: 12, color: '#888' },
  statement: { fontSize: 14, fontStyle: 'italic', color: '#333' },
  attribution: { fontSize: 12, color: '#666', marginTop: 2, marginBottom: 4 },
  calledBy: { fontSize: 12, color: '#555', marginBottom: 8 },
  punishmentBanner: { borderRadius: 8, padding: 10, marginBottom: 4 },
  owesBanner: { backgroundColor: '#FFE5E5' },
  owedBanner: { backgroundColor: '#E5F5E5' },
  punishmentText: { fontSize: 13, fontWeight: '600', color: '#333' },
  deliveredText: { fontSize: 13, color: '#34C759', fontWeight: '600', marginTop: 4 },
  tapHint: { fontSize: 11, color: '#007AFF', textAlign: 'right', marginTop: 6 },
});

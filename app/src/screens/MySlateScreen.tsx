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
import { GrogService } from '../services/GrogService';
import { useStore } from '../store';
import { Grog, LiquorCategory, PendingAddBack, PlayerDebtIndex } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import AddLiquorSheet from './components/AddLiquorSheet';

type Props = NativeStackScreenProps<GroupStackParamList, never>;

type SectionItem = PlayerDebtIndex | PendingAddBack;

type Section = {
  title: string;
  data: SectionItem[];
  emptyText: string;
};

const PUNISHMENT_LABEL: Record<string, string> = {
  slap: '👋 Slap',
  infinity_grog: '🍺 Infinity Grog',
};

export default function MySlateScreen({ navigation }: { navigation: Props['navigation'] }) {
  const activeGroup = useStore((s) => s.activeGroup);
  const groupId = activeGroup?.groupId ?? '';
  const groupName = activeGroup?.groupName ?? '';
  const player = useStore((s) => s.player);
  const currentPlayerId = player?.playerId ?? '';

  const [debts, setDebts] = useState<PlayerDebtIndex[]>([]);
  const [grog, setGrog] = useState<Grog | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addBackTarget, setAddBackTarget] = useState<PendingAddBack | null>(null);
  const [addBackError, setAddBackError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Single GSI4 query — all denormalized fields, no second fetch needed
      const [myDebts, members, grogData] = await Promise.all([
        ManchesterService.getMyDebts(groupId),
        GroupService.getGroupMembers(groupId),
        GrogService.getGrog(groupId).catch(() => null), // null if grog not initialized
      ]);

      const nameMap: Record<string, string> = {};
      for (const m of members) nameMap[m.playerId] = m.username ?? m.playerId;
      setMemberNames(nameMap);
      setDebts(myDebts);
      setGrog(grogData);
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

  // Outstanding Punishments: resolved, you are debtor or creditor, not yet delivered
  const outstanding = debts.filter(
    (d) => d.status === 'resolved'
  );

  // History: delivered
  const history = debts.filter((d) => d.status === 'delivered');

  // Pending add-backs for the current player only
  const myPendingAddBacks = (grog?.pendingAddBacks ?? []).filter(
    (p) => p.debtorId === currentPlayerId
  );

  const handleRedeemAddBack = async (entry: PendingAddBack, category: LiquorCategory, brand: string) => {
    setAddBackError(null);
    try {
      await GrogService.redeemAddBack(groupId, entry.debtId, category, brand);
      setAddBackTarget(null);
      void load();
    } catch (e) {
      console.error('[MySlateScreen] redeemAddBack failed:', e);
      setAddBackError('Failed to add back liquor. Please try again.');
    }
  };

  // Waiting: pending_confirmation where you've already submitted (other party hasn't)
  // We can't know this from GSI4 alone without the confirmation fields, so we show
  // pending_confirmation under Needs Action for now (both parties see it there)

  const debtSections: Section[] = [
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

  const addBackSection: Section = {
    title: 'Add Back to Grog',
    data: myPendingAddBacks,
    emptyText: '',
  };

  // Insert add-back section before History if there are pending add-backs
  const sections: Section[] = myPendingAddBacks.length > 0
    ? [debtSections[0], debtSections[1], addBackSection, debtSections[2]]
    : debtSections;

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <SectionList
        sections={sections}
        keyExtractor={(item) => {
          if ('debtId' in item && 'debtorId' in item && !('playerId' in item)) {
            // PendingAddBack
            return `addback-${(item as PendingAddBack).debtId}`;
          }
          return (item as PlayerDebtIndex).debtId;
        }}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 && section.emptyText ? (
            <Text style={styles.empty}>{section.emptyText}</Text>
          ) : null
        }
        renderItem={({ item, section }) => {
          // Render pending add-back card
          if (section.title === 'Add Back to Grog') {
            const addBack = item as PendingAddBack;
            return (
              <TouchableOpacity
                style={styles.card}
                onPress={() => {
                  setAddBackError(null);
                  setAddBackTarget(addBack);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.badge, styles.grogBadge]}>INFINITY GROG</Text>
                  <Text style={styles.date}>{new Date(addBack.createdAt).toLocaleDateString()}</Text>
                </View>
                <View style={[styles.punishmentBanner, styles.addBackBanner]}>
                  <Text style={styles.punishmentText}>🍺 You have a pending add-back</Text>
                </View>
                <Text style={styles.tapHint}>Tap to add liquor back →</Text>
              </TouchableOpacity>
            );
          }

          // Render debt card
          const debt = item as PlayerDebtIndex;
          const isActive = section.title === 'Needs Action';
          const isOutstanding = section.title === 'Outstanding Punishments';
          const isDebtor = debt.debtorId === currentPlayerId;
          const isCreditor = debt.creditorId === currentPlayerId;

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => {
                if (isActive) {
                  navigation.navigate('ResolutionConfirmation', {
                    debtId: debt.debtId,
                    groupId,
                    groupName,
                  });
                } else if (isOutstanding && (isDebtor || isCreditor) && debt.debtPunishment) {
                  if (debt.debtPunishment === 'infinity_grog' && isDebtor) {
                    navigation.navigate('InfinityGrogSentence', {
                      debtId: debt.debtId,
                      groupId,
                      groupName,
                    });
                  } else {
                    navigation.navigate('ResolutionConfirmation', {
                      debtId: debt.debtId,
                      groupId,
                      groupName,
                    });
                  }
                }
              }}
              activeOpacity={isActive || (isOutstanding && (isDebtor || isCreditor)) ? 0.7 : 1}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.badge}>MANCHESTER</Text>
                <Text style={styles.date}>{new Date(debt.createdAt).toLocaleDateString()}</Text>
              </View>

              <Text style={styles.statement}>"{debt.statement}"</Text>
              <Text style={styles.attribution}>— {nameFor(debt.statementMakerId)}</Text>
              <Text style={styles.calledBy}>{nameFor(debt.challengerId)} called Manchester</Text>

              {isOutstanding && debt.debtPunishment && (
                <View style={[styles.punishmentBanner, isDebtor ? styles.owesBanner : styles.owedBanner]}>
                  <Text style={styles.punishmentText}>
                    {isDebtor
                      ? `You owe ${nameFor(debt.creditorId)}: ${PUNISHMENT_LABEL[debt.debtPunishment] ?? debt.debtPunishment}`
                      : `${nameFor(debt.debtorId)} owes you: ${PUNISHMENT_LABEL[debt.debtPunishment] ?? debt.debtPunishment}`}
                  </Text>
                </View>
              )}

              {section.title === 'History' && debt.debtPunishment && (
                <Text style={styles.deliveredText}>
                  ✓ {isDebtor || isCreditor
                    ? `${nameFor(debt.debtorId)} paid ${nameFor(debt.creditorId)} — ${PUNISHMENT_LABEL[debt.debtPunishment] ?? debt.debtPunishment}`
                    : 'Delivered'}
                </Text>
              )}

              {isActive && (
                <Text style={styles.tapHint}>Tap to respond →</Text>
              )}
              {isOutstanding && (isDebtor || isCreditor) && debt.debtPunishment && (
                <Text style={styles.tapHint}>Tap to deliver →</Text>
              )}
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.list}
      />

      {addBackTarget && (
        <>
          {addBackError && <Text style={styles.floatingError}>{addBackError}</Text>}
          <AddLiquorSheet
            onSubmit={(category, brand) => {
              void handleRedeemAddBack(addBackTarget, category, brand);
            }}
            onClose={() => {
              setAddBackTarget(null);
              setAddBackError(null);
            }}
          />
        </>
      )}
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
  addBackBanner: { backgroundColor: '#FFF3E0' },
  punishmentText: { fontSize: 13, fontWeight: '600', color: '#333' },
  deliveredText: { fontSize: 13, color: '#34C759', fontWeight: '600', marginTop: 4 },
  tapHint: { fontSize: 11, color: '#007AFF', textAlign: 'right', marginTop: 6 },
  grogBadge: { backgroundColor: '#FF9500' },
  floatingError: { color: '#FF3B30', marginHorizontal: 16, marginBottom: 4, fontSize: 13 },
});

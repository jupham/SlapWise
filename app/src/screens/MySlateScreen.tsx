import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ManchesterService } from '../services/ManchesterService';
import { GroupService } from '../services/GroupService';
import { GrogService } from '../services/GrogService';
import { useStore } from '../store';
import { Grog, LiquorCategory, PendingAddBack, PlayerDebtIndex } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import AddLiquorSheet from './components/AddLiquorSheet';
import { color, displayName, font, label, radius, size, space, title } from '../theme';

type Props = NativeStackScreenProps<GroupStackParamList, never>;

type SectionItem = PlayerDebtIndex | PendingAddBack;

type Section = {
  title: string;
  data: SectionItem[];
  emptyText: string;
};

const PUNISHMENT_LABEL: Record<string, string> = {
  slap: 'SLAP',
  infinity_grog: 'INFINITY GROG',
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
  const insets = useSafeAreaInsets();

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
    const name = displayName(memberNames[id] ?? id);
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

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {error && <Text style={styles.error}>{error}</Text>}
      <SectionList
        ListHeaderComponent={<Text style={styles.screenTitle}>My slate</Text>}
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
                  <Text style={styles.punishmentText}>Pending add-back</Text>
                  <Text style={[styles.punishmentValue, styles.addBackValue]}>OWED</Text>
                </View>
                <Text style={styles.tapHint}>Add liquor back →</Text>
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
                    {isDebtor ? `You owe ${nameFor(debt.creditorId)}` : `${nameFor(debt.debtorId)} owes you`}
                  </Text>
                  <Text style={[styles.punishmentValue, isDebtor ? styles.owesValue : styles.owedValue]}>
                    {PUNISHMENT_LABEL[debt.debtPunishment] ?? debt.debtPunishment}
                  </Text>
                </View>
              )}

              {section.title === 'History' && debt.debtPunishment && (
                <Text style={styles.deliveredText}>
                  {isDebtor || isCreditor
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
  container: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, backgroundColor: color.bg },
  list: { paddingHorizontal: space.lg, paddingBottom: 40 },
  screenTitle: { ...title, marginTop: space.md, marginBottom: space.xs },
  error: { color: color.dangerText, marginHorizontal: space.lg, marginTop: space.md, fontSize: size.caption },
  sectionHeader: { ...label, marginTop: space.xl, marginBottom: space.sm },
  empty: { fontSize: size.caption, color: color.textDim, marginBottom: space.md },

  // A left rule in the accent does the work a border-radius card used to:
  // it aligns every entry to one edge, so the column scans like a table.
  card: {
    backgroundColor: color.surface,
    borderLeftWidth: 3,
    borderLeftColor: color.accent,
    padding: space.md,
    marginBottom: space.sm,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: space.sm,
  },
  badge: {
    backgroundColor: color.accent, color: color.accentInk,
    fontSize: 9, fontWeight: '700', letterSpacing: 1.2,
    paddingHorizontal: space.sm, paddingVertical: 3,
    borderRadius: radius.sm, overflow: 'hidden',
  },
  grogBadge: { backgroundColor: color.regalia, color: color.text },
  date: { fontSize: size.label, color: color.textDim },

  statement: { fontSize: size.body, color: color.text, fontFamily: font.body, lineHeight: 20 },
  attribution: { fontSize: size.caption, color: color.textMuted, marginTop: space.xs },
  calledBy: { fontSize: size.caption, color: color.textMuted, marginBottom: space.md },

  punishmentBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: color.surfaceRaised, paddingHorizontal: space.md,
    paddingVertical: space.sm, borderRadius: radius.sm,
  },
  owesBanner: {},
  owedBanner: {},
  addBackBanner: {},
  punishmentText: { fontSize: size.caption, color: color.textMuted },
  punishmentValue: {
    fontFamily: font.condensed, fontSize: size.heading,
    letterSpacing: 0.6, color: color.text,
  },
  owesValue: { color: color.accent },
  owedValue: { color: color.success },
  addBackValue: { color: color.accent },

  deliveredText: { fontSize: size.caption, color: color.success, marginTop: space.sm },
  tapHint: {
    fontSize: size.label, color: color.accent, textAlign: 'right',
    marginTop: space.md, fontWeight: '700', letterSpacing: 0.8,
  },
  floatingError: {
    color: color.dangerText, marginHorizontal: space.lg,
    marginBottom: space.xs, fontSize: size.caption,
  },
});

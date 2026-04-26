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
import { ManchesterService } from '../services/ManchesterService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { SlapDebt, ResolutionOutcome, PunishmentType } from '../types';
import type { GroupStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<GroupStackParamList, 'ResolutionConfirmation'>;

export default function ResolutionConfirmationScreen({ route, navigation }: Props) {
  const { debtId, groupId, groupName } = route.params;

  const player = useStore((s) => s.player);

  const [debt, setDebt] = useState<SlapDebt | null>(null);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPunishment, setSelectedPunishment] = useState<PunishmentType | null>(null);

  const usernameFor = useCallback(
    (playerId: string | null): string => {
      if (!playerId) return 'Unknown';
      return memberNames[playerId] ?? playerId;
    },
    [memberNames]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [debt, groupMembers] = await Promise.all([
        ManchesterService.getDebt(groupId, debtId),
        GroupService.getGroupMembers(groupId),
      ]);
      setDebt(debt ?? null);
      const nameMap: Record<string, string> = {};
      for (const m of groupMembers) nameMap[m.playerId] = m.username ?? m.playerId;
      setMemberNames(nameMap);
    } catch (err) {
      console.error('[ResolutionConfirmationScreen] load failed:', err);
      setError('Failed to load debt details');
    } finally {
      setLoading(false);
    }
  }, [debtId, groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (outcome: ResolutionOutcome, punishment: PunishmentType) => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await ManchesterService.submitResolutionConfirmation(debtId, groupId, outcome, punishment);
      setDebt(updated);
    } catch (e) {
      console.error('[ResolutionConfirmationScreen] submitResolutionConfirmation failed:', e);
      const msg = e instanceof Error ? e.message : 'Failed to submit confirmation';
      Alert.alert('Error', msg);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} />;

  if (!debt) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error ?? 'Debt not found'}</Text>
      </View>
    );
  }

  const currentPlayerId = player?.playerId ?? '';
  const isChallenger = debt.challengerId === currentPlayerId;
  const isStatementMaker = debt.statementMakerId === currentPlayerId;
  const isParty = isChallenger || isStatementMaker;

  const alreadyConfirmed =
    (isChallenger && debt.challengerConfirmation != null) ||
    (isStatementMaker && debt.statementMakerConfirmation != null);

  const canConfirm =
    isParty &&
    !alreadyConfirmed &&
    (debt.status === 'pending' || debt.status === 'pending_confirmation');

  // When it's the second party's turn, they must agree with the first party's answer
  const firstPartyOutcome: string | null =
    debt.status === 'pending_confirmation' && isParty && !alreadyConfirmed
      ? (isChallenger
          ? debt.statementMakerConfirmation?.outcome ?? null
          : debt.challengerConfirmation?.outcome ?? null)
      : null;

  const firstPartyName: string =
    debt.status === 'pending_confirmation' && isParty && !alreadyConfirmed
      ? (isChallenger
          ? usernameFor(debt.statementMakerId)
          : usernameFor(debt.challengerId))
      : '';

  const challengerName = usernameFor(debt.challengerId);
  const statementMakerName = usernameFor(debt.statementMakerId);

  const outcomeLabel = (outcome: string | null | undefined) => {
    if (outcome === 'followed_through') return { text: '✓ Followed Through', color: '#34C759' };
    if (outcome === 'did_not_follow_through') return { text: '✗ Did Not Follow Through', color: '#FF3B30' };
    return { text: '— Pending', color: '#aaa' };
  };

  const challengerStatus = outcomeLabel(debt.challengerConfirmation?.outcome);
  const statementMakerStatus = outcomeLabel(debt.statementMakerConfirmation?.outcome);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Card — same layout as pending list */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.badge}>MANCHESTER</Text>
          <Text style={styles.date}>{new Date(debt.createdAt).toLocaleDateString()}</Text>
        </View>

        <Text style={styles.statement}>"{debt.statement}"</Text>
        <Text style={styles.statementBy}>— {statementMakerName}</Text>

        <Text style={styles.calledBy}>{challengerName} called Manchester</Text>

        {/* Side-by-side confirmations */}
        <View style={styles.confirmRow}>
          <View style={[styles.confirmCol, styles.confirmColLeft]}>
            <Text style={styles.confirmName} numberOfLines={1}>{challengerName}</Text>
            <Text style={[styles.confirmOutcome, { color: challengerStatus.color }]}>
              {challengerStatus.text}
            </Text>
          </View>
          <View style={styles.confirmCol}>
            <Text style={styles.confirmName} numberOfLines={1}>{statementMakerName}</Text>
            <Text style={[styles.confirmOutcome, { color: statementMakerStatus.color }]}>
              {statementMakerStatus.text}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>{debt.status.replace(/_/g, ' ')}</Text>
        </View>
      </View>

      {/* Resolved outcome */}
      {debt.status === 'resolved' && debt.debtPunishment === 'infinity_grog' && debt.debtorId === currentPlayerId ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {`Resolved — you must take a shot from the infinity grog`}
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnGrog]}
            onPress={() => navigation.navigate('InfinityGrogSentence', { debtId, groupId, groupName })}
          >
            <Text style={styles.btnText}>Take the Shot</Text>
          </TouchableOpacity>
        </View>
      ) : debt.status === 'resolved' ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {debt.debtPunishment === 'infinity_grog'
              ? `Resolved — ${usernameFor(debt.debtorId)} must take a shot from the infinity grog`
              : `Resolved — ${usernameFor(debt.debtorId)} owes ${usernameFor(debt.creditorId)} a slap`}
          </Text>
        </View>
      ) : null}

      {/* Waiting states */}
      {debt.status === 'pending_confirmation' && !canConfirm && !alreadyConfirmed && (
        <View style={[styles.infoBox, styles.pendingBox]}>
          <Text style={styles.infoText}>Waiting for the other party to confirm</Text>
        </View>
      )}

      {alreadyConfirmed && debt.status === 'pending_confirmation' && (
        <View style={[styles.infoBox, styles.pendingBox]}>
          <Text style={styles.infoText}>You've responded — waiting for the other party</Text>
        </View>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {/* First party: free choice */}
      {canConfirm && debt.status === 'pending' && (
        <View style={styles.actions}>
          <Text style={styles.actionsHeading}>My punishment if I lose</Text>
          <View style={styles.punishmentRow}>
            <TouchableOpacity
              style={[styles.punishBtn, selectedPunishment === 'slap' && styles.punishBtnSelected]}
              onPress={() => setSelectedPunishment('slap')}
            >
              <Text style={[styles.punishBtnText, selectedPunishment === 'slap' && styles.punishBtnTextSelected]}>
                👋 Slap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.punishBtn, selectedPunishment === 'infinity_grog' && styles.punishBtnSelected]}
              onPress={() => setSelectedPunishment('infinity_grog')}
            >
              <Text style={[styles.punishBtnText, selectedPunishment === 'infinity_grog' && styles.punishBtnTextSelected]}>
                🍺 Infinity Grog
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.actionsHeading, { marginTop: 16 }]}>What happened?</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen, (!selectedPunishment || submitting) && styles.btnDisabled]}
            onPress={() => selectedPunishment && handleSubmit('followed_through', selectedPunishment)}
            disabled={!selectedPunishment || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Followed Through</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnRed, (!selectedPunishment || submitting) && styles.btnDisabled]}
            onPress={() => selectedPunishment && handleSubmit('did_not_follow_through', selectedPunishment)}
            disabled={!selectedPunishment || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Did Not Follow Through</Text>}
          </TouchableOpacity>
          {!selectedPunishment && (
            <Text style={styles.punishHint}>Select your punishment first</Text>
          )}
        </View>
      )}

      {/* Second party: must agree with first party's answer */}
      {canConfirm && debt.status === 'pending_confirmation' && firstPartyOutcome && (
        <View style={styles.actions}>
          <Text style={styles.actionsHeading}>My punishment if I lose</Text>
          <View style={styles.punishmentRow}>
            <TouchableOpacity
              style={[styles.punishBtn, selectedPunishment === 'slap' && styles.punishBtnSelected]}
              onPress={() => setSelectedPunishment('slap')}
            >
              <Text style={[styles.punishBtnText, selectedPunishment === 'slap' && styles.punishBtnTextSelected]}>
                👋 Slap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.punishBtn, selectedPunishment === 'infinity_grog' && styles.punishBtnSelected]}
              onPress={() => setSelectedPunishment('infinity_grog')}
            >
              <Text style={[styles.punishBtnText, selectedPunishment === 'infinity_grog' && styles.punishBtnTextSelected]}>
                🍺 Infinity Grog
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.actionsHeading, { marginTop: 16 }]}>Confirm what happened</Text>
          <View style={[styles.infoBox, styles.pendingBox]}>
            <Text style={styles.infoText}>
              {firstPartyName} said:{' '}
              <Text style={{ fontWeight: '700' }}>
                {firstPartyOutcome === 'followed_through' ? 'Followed Through' : 'Did Not Follow Through'}
              </Text>
            </Text>
            <Text style={[styles.infoText, { marginTop: 6, color: '#888' }]}>
              If you disagree, sort it out with them first and come back.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen, (!selectedPunishment || submitting) && styles.btnDisabled]}
            onPress={() => selectedPunishment && handleSubmit(firstPartyOutcome as ResolutionOutcome, selectedPunishment)}
            disabled={!selectedPunishment || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Agree &amp; Confirm</Text>}
          </TouchableOpacity>
          {!selectedPunishment && (
            <Text style={styles.punishHint}>Select your punishment first</Text>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  center: { flex: 1 },
  card: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    padding: 14, marginBottom: 16, backgroundColor: '#fafafa',
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
    overflow: 'hidden', marginBottom: 12,
  },
  confirmCol: { flex: 1, padding: 10 },
  confirmColLeft: { borderRightWidth: 1, borderRightColor: '#eee' },
  confirmName: { fontSize: 12, color: '#888', marginBottom: 3 },
  confirmOutcome: { fontSize: 12, fontWeight: '700' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  statusLabel: { fontSize: 13, color: '#888' },
  statusValue: { fontSize: 13, fontWeight: '600', color: '#333', textTransform: 'capitalize' },
  infoBox: {
    backgroundColor: '#F0F0F0', borderRadius: 8,
    padding: 14, marginBottom: 16, alignItems: 'center',
  },
  pendingBox: { backgroundColor: '#FFF3CD' },
  infoText: { fontSize: 14, color: '#333', textAlign: 'center' },
  errorText: { color: '#FF3B30', fontSize: 14, marginBottom: 12, textAlign: 'center' },
  actions: { marginTop: 8 },
  actionsHeading: { fontSize: 16, fontWeight: '700', marginBottom: 12, color: '#333' },
  punishmentRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  punishBtn: {
    flex: 1, padding: 14, borderRadius: 8, alignItems: 'center',
    borderWidth: 2, borderColor: '#ddd', backgroundColor: '#fafafa',
  },
  punishBtnSelected: { borderColor: '#007AFF', backgroundColor: '#E8F0FE' },
  punishBtnText: { fontSize: 14, fontWeight: '600', color: '#555' },
  punishBtnTextSelected: { color: '#007AFF' },
  punishHint: { fontSize: 12, color: '#FF3B30', textAlign: 'center', marginTop: 4 },
  btn: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  btnGreen: { backgroundColor: '#34C759' },
  btnRed: { backgroundColor: '#FF3B30' },
  btnGrog: { backgroundColor: '#FF9500', marginTop: 12, marginBottom: 0 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

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
import { debtStatusLabel, punishmentPhrase } from '../copy/punishment';
import { color, displayName, font, label, radius, size, space } from '../theme';

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
      for (const m of groupMembers) nameMap[m.playerId] = displayName(m.username ?? m.playerId);
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

  /**
   * The route registers a static "Confirm Resolution", which is wrong for most
   * of the states this screen renders — you often cannot confirm anything,
   * either because it is not your Manchester or because you already answered.
   * Retitle from the state the viewer is actually in.
   *
   * Sits above the early returns so the hook order stays fixed, and guards on
   * `debt` instead.
   */
  useEffect(() => {
    if (!debt) return;
    const me = player?.playerId ?? '';
    const challenger = debt.challengerId;
    const maker = debt.statementMakerId;
    const iAmParty = me === challenger || me === maker;
    const iAnswered =
      (me === challenger && debt.challengerConfirmation != null) ||
      (me === maker && debt.statementMakerConfirmation != null);

    let heading: string;
    if (debt.status === 'delivered') {
      heading = 'Settled';
    } else if (debt.status === 'resolved') {
      heading = 'Ruled';
    } else if (iAmParty && !iAnswered) {
      heading = 'Confirm resolution';
    } else if (iAmParty) {
      const otherId = me === challenger ? maker : challenger;
      heading = `Waiting on ${memberNames[otherId ?? ''] ?? 'the other party'}`;
    } else {
      heading = 'Manchester';
    }

    navigation.setOptions({ title: heading });
  }, [debt, memberNames, navigation, player]);

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

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

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

  const subjectLabel = isStatementMaker ? 'you' : usernameFor(debt.statementMakerId);
  const challengerName = usernameFor(debt.challengerId);
  const statementMakerName = usernameFor(debt.statementMakerId);

  /**
   * Both parties answer one question — did the *statement maker* follow through
   * — so these are votes, not descriptions of the person named above them.
   * Rendering the raw outcome under each name read as though both of them had
   * failed, which only one of them can do.
   */
  const outcomeLabel = (outcome: string | null | undefined) => {
    if (outcome === 'followed_through') return { text: 'Yes', tint: color.success };
    if (outcome === 'did_not_follow_through') return { text: 'No', tint: color.accent };
    return { text: 'No answer yet', tint: color.textDim };
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

        {/* Both sides answer one question about the statement maker, so the
            question is stated once and each column is that person's answer. */}
        <Text style={styles.confirmQuestion}>
          Did {statementMakerName} follow through?
        </Text>
        <View style={styles.confirmRow}>
          <View style={[styles.confirmCol, styles.confirmColLeft]}>
            <Text style={styles.confirmName} numberOfLines={1}>{challengerName} said</Text>
            <Text style={[styles.confirmOutcome, { color: challengerStatus.tint }]}>
              {challengerStatus.text}
            </Text>
          </View>
          <View style={styles.confirmCol}>
            <Text style={styles.confirmName} numberOfLines={1}>{statementMakerName} said</Text>
            <Text style={[styles.confirmOutcome, { color: statementMakerStatus.tint }]}>
              {statementMakerStatus.text}
            </Text>
          </View>
        </View>

        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusValue}>{debtStatusLabel(debt.status)}</Text>
        </View>
      </View>

      {/* Resolved outcome */}
      {debt.status === 'resolved' && debt.debtPunishment === 'infinity_grog' && debt.debtorId === currentPlayerId ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {'Ruled — you take a shot from the grog'}
          </Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnGrog]}
            onPress={() => navigation.navigate('InfinityGrogSentence', { debtId, groupId, groupName })}
          >
            <Text style={styles.btnTextOnAccent}>Take the Shot</Text>
          </TouchableOpacity>
        </View>
      ) : debt.status === 'resolved' ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {debt.debtPunishment
              ? `Ruled — ${punishmentPhrase({
                  punishment: debt.debtPunishment,
                  debtor: usernameFor(debt.debtorId),
                  creditor: usernameFor(debt.creditorId),
                  debtorIsYou: debt.debtorId === currentPlayerId,
                  creditorIsYou: debt.creditorId === currentPlayerId,
                })}`
              : 'Ruled'}
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
                Slap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.punishBtn, selectedPunishment === 'infinity_grog' && styles.punishBtnSelected]}
              onPress={() => setSelectedPunishment('infinity_grog')}
            >
              <Text style={[styles.punishBtnText, selectedPunishment === 'infinity_grog' && styles.punishBtnTextSelected]}>
                Infinity grog
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.actionsHeading, { marginTop: 16 }]}>Did {subjectLabel} follow through?</Text>
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen, (!selectedPunishment || submitting) && styles.btnDisabled]}
            onPress={() => selectedPunishment && handleSubmit('followed_through', selectedPunishment)}
            disabled={!selectedPunishment || submitting}
          >
            {submitting ? <ActivityIndicator color={color.text} /> : <Text style={styles.btnText}>Yes</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, styles.btnRed, (!selectedPunishment || submitting) && styles.btnDisabled]}
            onPress={() => selectedPunishment && handleSubmit('did_not_follow_through', selectedPunishment)}
            disabled={!selectedPunishment || submitting}
          >
            {submitting ? <ActivityIndicator color={color.text} /> : <Text style={styles.btnText}>No</Text>}
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
                Slap
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.punishBtn, selectedPunishment === 'infinity_grog' && styles.punishBtnSelected]}
              onPress={() => setSelectedPunishment('infinity_grog')}
            >
              <Text style={[styles.punishBtnText, selectedPunishment === 'infinity_grog' && styles.punishBtnTextSelected]}>
                Infinity grog
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.actionsHeading, { marginTop: 16 }]}>
            Did {subjectLabel} follow through?
          </Text>
          <View style={[styles.infoBox, styles.pendingBox]}>
            <Text style={styles.infoText}>
              {firstPartyName} said:{' '}
              <Text style={{ fontWeight: '700' }}>
                {firstPartyOutcome === 'followed_through' ? 'Yes' : 'No'}
              </Text>
            </Text>
            <Text style={[styles.infoText, { marginTop: space.sm, color: color.textMuted }]}>
              If you disagree, sort it out with them first and come back.
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.btn, styles.btnGreen, (!selectedPunishment || submitting) && styles.btnDisabled]}
            onPress={() => selectedPunishment && handleSubmit(firstPartyOutcome as ResolutionOutcome, selectedPunishment)}
            disabled={!selectedPunishment || submitting}
          >
            {submitting ? <ActivityIndicator color={color.text} /> : <Text style={styles.btnText}>Agree &amp; Confirm</Text>}
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
  container: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg },
  center: { flex: 1, backgroundColor: color.bg },
  card: {
    backgroundColor: color.surface,
    borderLeftWidth: 3, borderLeftColor: color.accent,
    padding: space.md, marginBottom: space.lg,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: space.sm,
  },
  badge: {
    backgroundColor: color.accent, color: color.accentInk, fontSize: 9,
    fontWeight: '700', letterSpacing: 1.2, paddingHorizontal: space.sm,
    paddingVertical: 3, borderRadius: radius.sm, overflow: 'hidden',
  },
  date: { fontSize: size.label, color: color.textDim },
  statement: { fontSize: size.body, color: color.text, lineHeight: 20 },
  statementBy: { fontSize: size.caption, color: color.textMuted, marginTop: space.xs },
  calledBy: { fontSize: size.caption, color: color.textMuted, marginBottom: space.md },

  confirmQuestion: {
    fontSize: size.caption, color: color.textMuted,
    marginBottom: space.sm,
  },
  confirmRow: {
    flexDirection: 'row', backgroundColor: color.surfaceRaised,
    borderRadius: radius.sm, overflow: 'hidden', marginBottom: space.md,
  },
  confirmCol: { flex: 1, padding: space.md },
  confirmColLeft: { borderRightWidth: 1, borderRightColor: color.border },
  confirmName: { ...label, color: color.textMuted, marginBottom: space.xs },
  confirmOutcome: { fontSize: size.caption, fontWeight: '700', color: color.text },
  statusRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: space.xs,
  },
  statusLabel: { fontSize: size.caption, color: color.textMuted },
  statusValue: {
    fontFamily: font.condensed, fontSize: size.heading,
    letterSpacing: 0.6, color: color.text, textTransform: 'uppercase',
  },

  infoBox: {
    backgroundColor: color.surface, borderLeftWidth: 3, borderLeftColor: color.borderStrong,
    padding: space.md, marginBottom: space.lg,
  },
  pendingBox: { borderLeftColor: color.regalia },
  infoText: { fontSize: size.body, color: color.text, lineHeight: 21 },
  errorText: {
    color: color.dangerText, fontSize: size.caption,
    marginBottom: space.md, textAlign: 'center',
  },

  actions: { marginTop: space.sm },
  actionsHeading: { ...label, marginBottom: space.md },
  punishmentRow: { flexDirection: 'row', gap: space.md, marginBottom: space.xs },
  // Selection reads as a filled accent rather than a tinted border: on a dark
  // ground a 2px border shift is far too quiet to register as "chosen".
  punishBtn: {
    flex: 1, paddingVertical: space.lg, borderRadius: radius.sm, alignItems: 'center',
    borderWidth: 1, borderColor: color.border, backgroundColor: color.surface,
  },
  punishBtnSelected: { borderColor: color.accent, backgroundColor: color.accent },
  punishBtnText: {
    fontSize: size.caption, fontWeight: '700', color: color.textMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
  },
  punishBtnTextSelected: { color: color.accentInk },
  punishHint: {
    fontSize: size.label, color: color.dangerText,
    textAlign: 'center', marginTop: space.sm,
  },

  btn: {
    paddingVertical: space.lg, borderRadius: radius.sm,
    alignItems: 'center', marginBottom: space.md,
  },
  // "Followed through" is the affirmative outcome and "did not" the negative,
  // but neither is destructive — both are ordinary answers, so they take
  // outlines and let the accent stay on the primary action.
  btnGreen: { borderWidth: 1, borderColor: color.success },
  btnRed: { borderWidth: 1, borderColor: color.borderStrong },
  btnGrog: { backgroundColor: color.accent, marginTop: space.md, marginBottom: 0 },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: color.text, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  // Dark ink for the one button that carries an accent fill; the near-white
  // btnText is only legible against the outlined variants.
  btnTextOnAccent: {
    color: color.accentInk, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});

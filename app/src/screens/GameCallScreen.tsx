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
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GameService } from '../services/GameService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { GameCall, GameCallAnswer } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { chugLine, gameName, joinNames } from '../copy/game';
import { quitterName } from '../copy/quitter';
import { color, displayName, font, label, radius, size, space, title } from '../theme';

type Props = NativeStackScreenProps<GroupStackParamList, 'GameCall'>;

/**
 * One call of the read-in game: who called whom, who has answered, and — once
 * everyone has — who drinks. A player who was called answers here, and only
 * for themselves.
 */
export default function GameCallScreen({ route, navigation }: Props) {
  const { groupId, callId } = route.params;
  const me = useStore((s) => s.player?.playerId ?? '');

  const [call, setCall] = useState<GameCall | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [game, setGame] = useState('Game');
  const [loading, setLoading] = useState(true);
  const [answering, setAnswering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [calls, members, group] = await Promise.all([
        GameService.getGameCalls(groupId),
        GroupService.getGroupMembers(groupId),
        GroupService.getGroup(groupId),
      ]);
      setCall(calls.find((c) => c.callId === callId) ?? null);
      setNames(Object.fromEntries(members.map((m) => [m.playerId, m.username ?? m.playerId])));
      setGame(gameName(group.readInGameName));
    } catch (e) {
      console.error('[GameCallScreen] load failed:', e);
      setError('Failed to load the call');
    } finally {
      setLoading(false);
    }
  }, [groupId, callId]);

  // Refetch on focus: other people's answers land while you are elsewhere.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  useEffect(() => {
    navigation.setOptions({ title: `${game} call` });
  }, [navigation, game]);

  const nameFor = (id: string) => displayName(names[id] ?? quitterName(id));
  const isYou = (id: string) => id === me;
  const subject = (id: string) => (isYou(id) ? 'You' : nameFor(id));
  const object = (id: string) => (isYou(id) ? 'you' : nameFor(id));

  /**
   * Records an answer — your own, or, as the caller, anyone's still waiting.
   * Confirmed first either way: the first answer in sticks.
   */
  const answer = (covered: boolean, forId: string = me) => {
    const self = forId === me;
    const who = nameFor(forId);
    const heading = self
      ? covered ? 'You were covered?' : 'You weren\u2019t covered?'
      : covered ? `Mark ${who} covered?` : `Mark ${who} not covered?`;
    const body = self
      ? covered
        ? 'If you were, the caller drinks. You can\u2019t change this answer.'
        : 'You drink. You can\u2019t change this answer.'
      : `${who} won\u2019t be able to change it.`;

    Alert.alert(heading, body, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: self ? (covered ? 'I was covered' : 'I wasn\u2019t') : 'Mark it',
        onPress: async () => {
          setAnswering(true);
          try {
            setCall(await GameService.respondToGameCall(groupId, callId, covered, forId));
          } catch (e) {
            console.error('[GameCallScreen] respond failed:', e);
            setError('Failed to record the answer — someone may have beaten you to it');
            void load();
          } finally {
            setAnswering(false);
          }
        },
      },
    ]);
  };

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  if (!call) {
    return (
      <View style={styles.center}>
        <Text style={styles.missing}>{error ?? 'This call could not be found.'}</Text>
      </View>
    );
  }

  const answers = new Map<string, GameCallAnswer>(call.answers.map((a) => [a.playerId, a.answer]));
  const answeredBy = new Map(call.answers.map((a) => [a.playerId, a.answeredBy]));
  const iAmCaller = isYou(call.callerId);
  const waitingOn = call.calledPlayerIds.filter((id) => !answers.has(id));
  const myTurn = call.status === 'open' && call.calledPlayerIds.includes(me) && !answers.has(me);
  const settled = call.status === 'settled';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headline}>
        {subject(call.callerId)} called {joinNames(call.calledPlayerIds.map(object))}
      </Text>
      <Text style={styles.stamp}>{new Date(call.createdAt).toLocaleString()}</Text>

      {settled && call.chuggerIds ? (
        <View style={styles.outcome}>
          <Text style={styles.outcomeLabel}>Result</Text>
          <Text style={styles.outcomeLine}>
            {chugLine(call.chuggerIds.map((id) => ({ name: nameFor(id), isYou: isYou(id) })))}
          </Text>
          {call.backfired ? (
            <Text style={styles.outcomeNote}>
              The call backfired — someone was covered, so {object(call.callerId)} drink
              {isYou(call.callerId) ? '' : 's'} too.
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Called</Text>
      {call.calledPlayerIds.map((id) => {
        const a = answers.get(id);
        const by = answeredBy.get(id);
        // The caller can settle anyone still waiting, right from the row.
        const callerCanSet = iAmCaller && !settled && !a;
        return (
          <View key={id} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>
                {nameFor(id)}
                {isYou(id) ? ' (you)' : ''}
              </Text>
              {a && by && by !== id ? (
                <Text style={styles.setBy}>set by {isYou(by) ? 'you' : nameFor(by)}</Text>
              ) : null}
            </View>
            {callerCanSet ? (
              <View style={styles.setRow}>
                <TouchableOpacity
                  style={[styles.setBtn, answering && styles.btnDisabled]}
                  onPress={() => answer(true, id)}
                  disabled={answering}
                >
                  <Text style={styles.setBtnText}>Covered</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.setBtn, answering && styles.btnDisabled]}
                  onPress={() => answer(false, id)}
                  disabled={answering}
                >
                  <Text style={styles.setBtnText}>Not covered</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text
                style={[
                  styles.answer,
                  a === 'covered' && styles.answerCovered,
                  a === 'not_covered' && styles.answerCaught,
                ]}
              >
                {a === 'covered' ? 'Covered' : a === 'not_covered' ? 'Not covered' : 'Waiting'}
              </Text>
            )}
          </View>
        );
      })}

      {!settled && !myTurn && waitingOn.length > 0 ? (
        <Text style={styles.waiting}>
          Waiting on {joinNames(waitingOn.map(object))}
          {iAmCaller ? '. You called it, so you can answer for them.' : ''}
        </Text>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {myTurn ? (
        <View style={styles.actions}>
          <Text style={styles.prompt}>Were you covered?</Text>
          <TouchableOpacity
            style={[styles.coveredBtn, answering && styles.btnDisabled]}
            onPress={() => answer(true)}
            disabled={answering}
          >
            <Text style={styles.coveredText}>I was covered</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.caughtBtn, answering && styles.btnDisabled]}
            onPress={() => answer(false)}
            disabled={answering}
          >
            <Text style={styles.caughtText}>Not covered — I drink</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, paddingBottom: 48 },
  center: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  missing: { color: color.textMuted, fontSize: size.body, textAlign: 'center' },

  headline: { ...title, fontSize: size.title, marginBottom: space.xs },
  stamp: { fontSize: size.label, color: color.textDim, marginBottom: space.xl },

  outcome: {
    backgroundColor: color.surface, borderLeftWidth: 3, borderLeftColor: color.regalia,
    padding: space.lg, marginBottom: space.xl,
  },
  outcomeLabel: { ...label, color: color.textMuted, marginBottom: space.sm },
  outcomeLine: { fontFamily: font.condensed, fontSize: size.title, color: color.text },
  outcomeNote: { fontSize: size.caption, color: color.textMuted, marginTop: space.sm, lineHeight: 18 },

  sectionLabel: { ...label, marginBottom: space.sm },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: color.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: size.body, color: color.text },
  setBy: { fontSize: size.label, color: color.textDim, marginTop: 2 },
  setRow: { flexDirection: 'row', gap: space.sm },
  setBtn: {
    borderWidth: 1, borderColor: color.regalia, borderRadius: radius.sm,
    paddingHorizontal: space.sm, paddingVertical: space.xs + 2,
  },
  setBtnText: { ...label, color: color.text, letterSpacing: 0.8 },
  answer: { ...label, color: color.textDim },
  answerCovered: { color: color.success },
  answerCaught: { color: color.accent },

  waiting: { fontSize: size.caption, color: color.textMuted, marginTop: space.lg },
  error: { color: color.dangerText, fontSize: size.caption, marginTop: space.lg },

  actions: { marginTop: space.xl, gap: space.md },
  prompt: { fontFamily: font.condensed, fontSize: size.heading, color: color.text },
  coveredBtn: {
    backgroundColor: color.regalia, paddingVertical: space.md + 2,
    borderRadius: radius.sm, alignItems: 'center',
  },
  coveredText: {
    color: color.text, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  // Owning up is an outline, not a fill — it is the costly answer, and the app
  // should not be the one nudging you toward it.
  caughtBtn: {
    borderWidth: 1, borderColor: color.borderStrong, paddingVertical: space.md + 2,
    borderRadius: radius.sm, alignItems: 'center',
  },
  caughtText: {
    color: color.text, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  btnDisabled: { opacity: 0.5 },
});

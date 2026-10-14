import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FeedService } from '../services/FeedService';
import { GroupService } from '../services/GroupService';
import { ManchesterService } from '../services/ManchesterService';
import { GameService } from '../services/GameService';
import { useStore } from '../store';
import { FeedEntry, GameCall, SlapDebt } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { punishmentPhrase } from '../copy/punishment';
import { chugLine, gameName, joinNames } from '../copy/game';
import { color, displayName, font, label, radius, size, space, title } from '../theme';
import { quitterName } from '../copy/quitter';

type Props = NativeStackScreenProps<GroupStackParamList, never>;

/**
 * One Manchester produces three entries — called, ruled, settled — which as a
 * flat list scatter across hours and read as unrelated rows. A thread is those
 * entries regrouped on the debt they share.
 */
interface Thread {
  refId: string;
  /** Oldest first, so the thread reads as the story unfolded. */
  steps: FeedEntry[];
  /** Newest step, which is what the feed orders on. */
  latestAt: string;
}

const DETAIL_TYPES = new Set(['manchester_created', 'manchester_resolved', 'slap_delivered']);
const GAME_TYPES = new Set(['game_called', 'game_settled']);

/**
 * Groups entries by the debt they belong to, then orders steps oldest-first
 * inside a thread and threads newest-first between them. A settled Manchester
 * that gains a step therefore jumps back to the top while still reading top to
 * bottom — which a plain chronological list cannot do.
 */
function buildThreads(entries: FeedEntry[]): Thread[] {
  const byRef = new Map<string, FeedEntry[]>();
  for (const entry of entries) {
    const key = entry.refId || entry.entryId;
    const bucket = byRef.get(key);
    if (bucket) bucket.push(entry);
    else byRef.set(key, [entry]);
  }

  const threads: Thread[] = [];
  for (const [refId, steps] of byRef) {
    steps.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    threads.push({ refId, steps, latestAt: steps[steps.length - 1].createdAt });
  }
  threads.sort((a, b) => b.latestAt.localeCompare(a.latestAt));
  return threads;
}

function initials(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

function shortTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(iso).toLocaleDateString();
}

function stampFor(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function GroupFeedScreen({ navigation }: { navigation: Props['navigation'] }) {
  const activeGroup = useStore((s) => s.activeGroup);
  const groupId = activeGroup?.groupId ?? '';
  const groupName = activeGroup?.groupName ?? '';
  const player = useStore((s) => s.player);
  const currentPlayerId = player?.playerId ?? '';
  const insets = useSafeAreaInsets();

  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  // Keyed by debtId, joined to threads on refId.
  const [debts, setDebts] = useState<Record<string, SlapDebt>>({});
  // Keyed by callId, joined to game threads on refId. Only fetched for a
  // read-in viewer — the server refuses anyone else.
  const [calls, setCalls] = useState<Record<string, GameCall>>({});
  const [readIn, setReadIn] = useState(false);
  const [game, setGame] = useState('Game');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only the first fetch blocks on the spinner; refocus refreshes in place.
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const [entries, members, allDebts, group] = await Promise.all([
        FeedService.getFeed(groupId),
        GroupService.getGroupMembers(groupId),
        ManchesterService.getAllDebts(groupId),
        GroupService.getGroup(groupId),
      ]);
      const nameMap: Record<string, string> = {};
      for (const m of members) nameMap[m.playerId] = m.username ?? m.playerId;
      const amReadIn = members.some((m) => m.playerId === currentPlayerId && m.isReadIn);
      const allCalls = amReadIn ? await GameService.getGameCalls(groupId) : [];

      setMemberNames(nameMap);
      setFeed(entries);
      setDebts(Object.fromEntries(allDebts.map((d) => [d.debtId, d])));
      setReadIn(amReadIn);
      setCalls(Object.fromEntries(allCalls.map((c) => [c.callId, c])));
      setGame(gameName(group.readInGameName));
    } catch (e) {
      console.error('[GroupFeedScreen] load failed:', e);
      setError('Failed to load feed');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [groupId, currentPlayerId]);

  // Tabs stay mounted, so a mount-only effect never sees anything that happened
  // while you were on another tab — a Manchester ruled elsewhere would not
  // appear until the app restarted.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const threads = useMemo(() => buildThreads(feed), [feed]);

  const isYou = (id: string | null | undefined) => !!id && id === currentPlayerId;

  /** Plain name, without a "(you)" suffix — the sentences read better with "you" inline. */
  const nameFor = (id: string | null | undefined) => {
    if (!id) return 'Someone';
    return displayName(memberNames[id] ?? quitterName(id));
  };

  const subjectFor = (id: string | null | undefined) => (isYou(id) ? 'You' : nameFor(id));
  const objectFor = (id: string | null | undefined) => (isYou(id) ? 'you' : nameFor(id));

  /** The sentence for one step. Falls back to `summary` for pre-detail entries. */
  const lineFor = (entry: FeedEntry): string => {
    switch (entry.type) {
      case 'manchester_created':
        if (!entry.statementMakerId) return entry.summary;
        return `${subjectFor(entry.challengerId ?? entry.actorId)} called Manchester on ${objectFor(entry.statementMakerId)}`;

      case 'manchester_resolved': {
        if (!entry.debtorId || !entry.punishment) return entry.summary;
        // The verdict is always about the statement maker, whichever way it
        // went. Blaming the debtor read wrongly when the call backfired: a
        // caller punished because the statement maker *did* follow through
        // was told they "didn't follow through", when they had nothing to do.
        // Entries without `outcome` fall back to who ended up paying, since
        // the challenger is the debtor only when the statement maker delivered.
        const statementMaker = entry.statementMakerId ?? null;
        const followedThrough = entry.outcome
          ? entry.outcome === 'followed_through'
          : !!entry.challengerId && entry.debtorId === entry.challengerId;
        const verdict = !statementMaker
          ? `${subjectFor(entry.debtorId)} lost the Manchester`
          : followedThrough
            ? `${subjectFor(statementMaker)} followed through`
            : `${subjectFor(statementMaker)} didn't follow through`;
        return `${verdict} — ${punishmentPhrase({
          punishment: entry.punishment,
          debtor: nameFor(entry.debtorId),
          creditor: nameFor(entry.creditorId),
          debtorIsYou: isYou(entry.debtorId),
          creditorIsYou: isYou(entry.creditorId),
        })}`;
      }

      case 'game_called':
        if (!entry.calledPlayerIds) return entry.summary;
        return `${subjectFor(entry.actorId)} called ${joinNames(entry.calledPlayerIds.map(objectFor))}`;

      case 'game_settled':
        if (!entry.chuggerIds) return entry.summary;
        return chugLine(entry.chuggerIds.map((id) => ({ name: nameFor(id), isYou: isYou(id) })));

      // A free shot, owed to nobody. Not punishmentPhrase: "took their shot"
      // reads as settling a debt, and there is none.
      case 'grog_shot':
        if (!entry.debtorId) return entry.summary;
        return `${subjectFor(entry.debtorId)} took a shot from the grog`;

      case 'slap_delivered':
        if (!entry.debtorId || !entry.punishment) return entry.summary;
        return punishmentPhrase({
          punishment: entry.punishment,
          debtor: nameFor(entry.debtorId),
          creditor: nameFor(entry.creditorId),
          debtorIsYou: isYou(entry.debtorId),
          creditorIsYou: isYou(entry.creditorId),
          past: true,
        });

      default:
        return entry.summary;
    }
  };

  /** Whose face belongs against a step — the person it happened to, not always the caller. */
  const faceFor = (entry: FeedEntry): string | null | undefined => {
    if (entry.type === 'manchester_created') return entry.challengerId ?? entry.actorId;
    if (GAME_TYPES.has(entry.type)) return entry.actorId;
    return entry.debtorId ?? entry.actorId;
  };

  /**
   * A first confirmation writes no feed entry — only the second one does, since
   * one person answering is a state rather than an event. So "waiting on Kyle"
   * cannot be read off the entries; it comes from the debt the thread points
   * at, joined on refId.
   *
   * Returns `urgent` when the viewer is the one holding it up, so the thread can
   * say so rather than sitting under a generic "open".
   */
  const threadStatus = (thread: Thread): { text: string; urgent: boolean } => {
    const last = thread.steps[thread.steps.length - 1];

    if (GAME_TYPES.has(last.type)) {
      if (last.type === 'game_settled') return { text: `${game} · settled`, urgent: false };
      const call = calls[thread.refId];
      if (!call) return { text: `${game} · called`, urgent: false };
      const answered = new Set(call.answers.map((a) => a.playerId));
      if (call.calledPlayerIds.includes(currentPlayerId) && !answered.has(currentPlayerId)) {
        return { text: `${game} · were you covered?`, urgent: true };
      }
      const waiting = call.calledPlayerIds.filter((id) => !answered.has(id));
      return { text: `${game} · waiting on ${joinNames(waiting.map(objectFor))}`, urgent: false };
    }

    if (last.type === 'grog_shot') return { text: 'Grog shot', urgent: false };

    if (last.type === 'slap_delivered') {
      return {
        text: last.punishment === 'infinity_grog' ? 'Settled with grog' : 'Settled',
        urgent: false,
      };
    }

    const debt = debts[thread.refId];

    if (last.type === 'manchester_resolved') {
      if (debt && (isYou(debt.debtorId) || isYou(debt.creditorId))) {
        const mineConfirmed = isYou(debt.debtorId)
          ? debt.debtorDeliveryConfirmed
          : debt.creditorDeliveryConfirmed;
        if (!mineConfirmed) return { text: 'Ruled · confirm it happened', urgent: true };
        const otherId = isYou(debt.debtorId) ? debt.creditorId : debt.debtorId;
        return { text: `Ruled · waiting on ${nameFor(otherId)}`, urgent: false };
      }
      return { text: 'Ruled · awaiting delivery', urgent: false };
    }

    if (last.type === 'manchester_created') {
      if (!debt) return { text: 'Called · open', urgent: false };

      const iAmChallenger = isYou(debt.challengerId);
      const iAmMaker = isYou(debt.statementMakerId);
      const myAnswer = iAmChallenger
        ? debt.challengerConfirmation
        : iAmMaker
          ? debt.statementMakerConfirmation
          : null;

      if ((iAmChallenger || iAmMaker) && !myAnswer) {
        return { text: 'Called · your answer needed', urgent: true };
      }
      if (iAmChallenger || iAmMaker) {
        const otherId = iAmChallenger ? debt.statementMakerId : debt.challengerId;
        return { text: `Called · waiting on ${nameFor(otherId)}`, urgent: false };
      }

      const answered =
        (debt.challengerConfirmation ? 1 : 0) + (debt.statementMakerConfirmation ? 1 : 0);
      return { text: answered === 1 ? 'Called · one answer in' : 'Called · open', urgent: false };
    }

    return { text: last.summary, urgent: false };
  };

  /** A thread involves you if you are named anywhere in it. */
  const threadIsMine = (thread: Thread) =>
    thread.steps.some((s) =>
      [
        s.actorId, s.challengerId, s.statementMakerId, s.debtorId, s.creditorId,
        ...(s.calledPlayerIds ?? []), ...(s.chuggerIds ?? []),
      ].some(isYou)
    );

  const openThread = (thread: Thread) => {
    const first = thread.steps[0];
    if (first.redacted) {
      // The tease: the only way to find out what happened is to get read in.
      navigation.navigate('ReadIn', { groupId, groupName });
    } else if (GAME_TYPES.has(first.type)) {
      navigation.navigate('GameCall', { groupId, groupName, callId: thread.refId });
    } else if (DETAIL_TYPES.has(first.type)) {
      navigation.navigate('ResolutionConfirmation', { debtId: thread.refId, groupId, groupName });
    } else if (first.type === 'grog_shot') {
      navigation.navigate('GroupTabs', { screen: 'Grog' });
    }
  };

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={threads}
        keyExtractor={(t) => t.refId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.screenTitle}>Feed</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No activity yet</Text>}
        renderItem={({ item: thread }) => {
          if (thread.steps[0].redacted) {
            // One card however many steps it had: an outsider learns that
            // something happened and when, and nothing else.
            return (
              <TouchableOpacity
                style={[styles.thread, styles.threadSecret]}
                onPress={() => openThread(thread)}
                activeOpacity={0.7}
              >
                <View style={styles.threadHeader}>
                  <Text style={[styles.threadStatus, styles.threadStatusSecret]}>Classified</Text>
                  <Text style={styles.threadTime}>{shortTime(thread.latestAt)}</Text>
                </View>
                <View style={styles.step}>
                  <View style={[styles.avatar, styles.avatarSecret]}>
                    <Text style={styles.avatarText}>?</Text>
                  </View>
                  <View style={styles.stepBody}>
                    <Text style={styles.stepLine}>Something went down. Only those read in know what.</Text>
                    <Text style={styles.secretLink}>Get read in →</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }

          const lastType = thread.steps[thread.steps.length - 1].type;
          const settled =
            lastType === 'slap_delivered' || lastType === 'game_settled' || lastType === 'grog_shot';
          const mine = threadIsMine(thread);
          const statement = thread.steps.find((s) => s.statement)?.statement;
          const status = threadStatus(thread);

          return (
            <TouchableOpacity
              style={[
                styles.thread,
                settled && styles.threadSettled,
                mine && styles.threadMine,
              ]}
              onPress={() => openThread(thread)}
              activeOpacity={0.7}
            >
              <View style={styles.threadHeader}>
                <Text
                  style={[
                    styles.threadStatus,
                    settled && styles.threadStatusSettled,
                    status.urgent && styles.threadStatusUrgent,
                  ]}
                >
                  {status.text}
                </Text>
                <Text style={styles.threadTime}>{shortTime(thread.latestAt)}</Text>
              </View>

              {thread.steps.map((step, i) => {
                const face = faceFor(step);
                return (
                  <View
                    key={step.entryId}
                    style={[styles.step, i > 0 && styles.stepDivided]}
                  >
                    <View style={[styles.avatar, isYou(face) && styles.avatarYou]}>
                      <Text style={[styles.avatarText, isYou(face) && styles.avatarTextYou]}>
                        {initials(nameFor(face))}
                      </Text>
                    </View>
                    <View style={styles.stepBody}>
                      <Text style={styles.stepLine}>{lineFor(step)}</Text>
                      {i === 0 && statement ? (
                        <Text style={styles.statement}>&ldquo;{statement}&rdquo;</Text>
                      ) : null}
                      <Text style={styles.stepTime}>
                        {stampFor(step.createdAt)}
                        {step.type === 'manchester_resolved' && step.challengerId && step.statementMakerId
                          ? ` · agreed by ${nameFor(step.challengerId)} and ${objectFor(step.statementMakerId)}`
                          : ''}
                        {(step.type === 'slap_delivered' || step.type === 'grog_shot') && step.amountMl
                          ? ` · ${step.amountMl.toFixed(1)} mL`
                          : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </TouchableOpacity>
          );
        }}
      />

      {/* The two things you come to the feed to do. The game button only
          exists for read-in players — outsiders get the Classified cards,
          which lead to Read In instead. */}
      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionManchester]}
          onPress={() => navigation.navigate('CreateChallenge', { groupId, groupName })}
        >
          <Text style={styles.actionManchesterText}>Call Manchester</Text>
        </TouchableOpacity>
        {readIn ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionGame]}
            onPress={() => navigation.navigate('CallGame', { groupId, groupName })}
          >
            <Text style={styles.actionGameText} numberOfLines={1}>Call {game}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, backgroundColor: color.bg },
  // Clears the action bar pinned beneath the list.
  list: { paddingHorizontal: space.lg, paddingBottom: 96 },
  screenTitle: { ...title, marginTop: space.md, marginBottom: space.lg },
  error: { color: color.dangerText, marginBottom: space.md, fontSize: size.caption },
  empty: { fontSize: size.body, color: color.textDim, textAlign: 'center', marginTop: 40 },

  thread: {
    backgroundColor: color.surface,
    borderLeftWidth: 3,
    borderLeftColor: color.accent,
    padding: space.md,
    marginBottom: space.sm,
  },
  threadSettled: { borderLeftColor: color.regalia },
  threadSecret: { borderLeftColor: color.borderStrong },
  threadStatusSecret: { color: color.textMuted },
  avatarSecret: { borderWidth: 1, borderColor: color.borderStrong, backgroundColor: color.bg },
  secretLink: { ...label, color: color.regalia, marginTop: space.sm },
  // A thread you are named in is lifted rather than recoloured, so "involves
  // me" and "what stage is it at" stay independent signals.
  threadMine: { backgroundColor: color.surfaceRaised, borderLeftWidth: 4 },

  threadHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: space.md,
  },
  threadStatus: { ...label },
  threadStatusSettled: { color: color.regalia },
  // Something is waiting on you specifically. Stays in the accent rather than
  // taking a new colour, so it reads as emphasis rather than a fourth state.
  threadStatusUrgent: { color: color.accent },
  threadTime: { fontSize: size.label, color: color.textDim },

  step: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stepDivided: {
    borderTopWidth: 1, borderTopColor: color.border,
    marginTop: space.md, paddingTop: space.md,
  },
  avatar: {
    width: 30, height: 30, borderRadius: radius.pill, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.border,
  },
  avatarYou: { backgroundColor: color.accent },
  avatarText: { fontFamily: font.condensed, fontSize: 13, color: color.textMuted },
  avatarTextYou: { color: color.accentInk },

  stepBody: { flex: 1, minWidth: 0 },
  stepLine: { fontSize: size.body, color: color.text, lineHeight: 20 },
  statement: {
    fontSize: size.caption, color: color.textMuted, marginTop: space.xs,
    borderLeftWidth: 2, borderLeftColor: color.border,
    paddingLeft: space.sm, lineHeight: 18,
  },
  stepTime: { fontSize: size.label, color: color.textDim, marginTop: space.xs },

  actionBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: space.sm,
    paddingHorizontal: space.lg, paddingVertical: space.md,
    backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.border,
  },
  actionBtn: {
    flex: 1, paddingVertical: space.md, borderRadius: radius.sm, alignItems: 'center',
  },
  actionManchester: { backgroundColor: color.accent },
  actionManchesterText: {
    color: color.accentInk, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  // Regalia for the game everywhere it appears, so orange stays Manchester's.
  actionGame: { backgroundColor: color.regalia },
  actionGameText: {
    color: color.text, fontWeight: '700', fontSize: size.caption,
    letterSpacing: 1, textTransform: 'uppercase',
  },
});

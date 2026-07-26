import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useStore } from '../store';
import { FeedEntry, SlapDebt } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { punishmentPhrase } from '../copy/punishment';
import { color, displayName, font, label, radius, size, space, title } from '../theme';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  // Only the first fetch blocks on the spinner; refocus refreshes in place.
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!hasLoadedRef.current) setLoading(true);
    setError(null);
    try {
      const [entries, members, allDebts] = await Promise.all([
        FeedService.getFeed(groupId),
        GroupService.getGroupMembers(groupId),
        ManchesterService.getAllDebts(groupId),
      ]);
      const nameMap: Record<string, string> = {};
      for (const m of members) nameMap[m.playerId] = m.username ?? m.playerId;
      setMemberNames(nameMap);
      setFeed(entries);
      setDebts(Object.fromEntries(allDebts.map((d) => [d.debtId, d])));
    } catch (e) {
      console.error('[GroupFeedScreen] load failed:', e);
      setError('Failed to load feed');
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [groupId]);

  // The subscription lives for the screen's lifetime; the refetch is on focus.
  useEffect(() => {
    subRef.current = FeedService.subscribeToChugEvents(groupId, () => void load());
    return () => { subRef.current?.unsubscribe(); };
  }, [load, groupId]);

  // Tabs stay mounted, so a mount-only effect never sees anything that happened
  // while you were on another tab — a Manchester ruled elsewhere would not
  // appear until the app restarted.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const threads = useMemo(() => buildThreads(feed), [feed]);

  const isYou = (id: string | null | undefined) => !!id && id === currentPlayerId;

  /** Plain name, without a "(you)" suffix — the sentences read better with "you" inline. */
  const nameFor = (id: string | null | undefined) => {
    if (!id) return 'Someone';
    return displayName(memberNames[id] ?? id);
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
        const verdict = `${subjectFor(entry.debtorId)} didn't follow through`;
        return `${verdict} — ${punishmentPhrase({
          punishment: entry.punishment,
          debtor: nameFor(entry.debtorId),
          creditor: nameFor(entry.creditorId),
          debtorIsYou: isYou(entry.debtorId),
          creditorIsYou: isYou(entry.creditorId),
        })}`;
      }

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
  const faceFor = (entry: FeedEntry): string | null | undefined =>
    entry.type === 'manchester_created' ? entry.challengerId ?? entry.actorId : entry.debtorId ?? entry.actorId;

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
      [s.actorId, s.challengerId, s.statementMakerId, s.debtorId, s.creditorId].some(isYou)
    );

  const openThread = (thread: Thread) => {
    if (DETAIL_TYPES.has(thread.steps[0].type)) {
      navigation.navigate('ResolutionConfirmation', { debtId: thread.refId, groupId, groupName });
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
          const settled = thread.steps[thread.steps.length - 1].type === 'slap_delivered';
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
                        {step.type === 'slap_delivered' && step.amountMl
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.bg },
  center: { flex: 1, backgroundColor: color.bg },
  list: { paddingHorizontal: space.lg, paddingBottom: 40 },
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
});

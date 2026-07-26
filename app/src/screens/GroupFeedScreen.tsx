import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FeedService } from '../services/FeedService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import { FeedEntry, FeedEntryType } from '../types';
import type { GroupStackParamList } from '../navigation/types';
import { color, displayName, font, label, radius, size, space, title } from '../theme';

type Props = NativeStackScreenProps<GroupStackParamList, never>;

/**
 * Each entry type gets a coloured left rule instead of an emoji: emoji ignore
 * tint, sit on their own baseline, and read as decoration rather than as the
 * category marker they were doing duty as.
 */
const EVENT_COLOR: Record<FeedEntryType, string> = {
  manchester_created: color.accent,
  manchester_resolved: color.success,
  slap_delivered: color.regalia,
  chug_event: color.regalia,
  member_joined: color.textDim,
};

const EVENT_LABEL: Record<FeedEntryType, string> = {
  manchester_created: 'Manchester Called',
  manchester_resolved: 'Manchester Resolved',
  slap_delivered: 'Punishment Delivered',
  chug_event: 'Game Called',
  member_joined: 'Member Joined',
};

export default function GroupFeedScreen({ navigation }: { navigation: Props['navigation'] }) {
  const activeGroup = useStore((s) => s.activeGroup);
  const groupId = activeGroup?.groupId ?? '';
  const groupName = activeGroup?.groupName ?? '';
  const player = useStore((s) => s.player);
  const currentPlayerId = player?.playerId ?? '';
  const insets = useSafeAreaInsets();

  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, members] = await Promise.all([
        FeedService.getFeed(groupId),
        GroupService.getGroupMembers(groupId),
      ]);

      const nameMap: Record<string, string> = {};
      for (const m of members) nameMap[m.playerId] = m.username ?? m.playerId;
      setMemberNames(nameMap);
      setFeed(entries);
    } catch (e) {
      console.error('[GroupFeedScreen] load failed:', e);
      setError('Failed to load feed');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();

    // Subscribe to new chug events for real-time updates; full feed refresh on focus
    subRef.current = FeedService.subscribeToChugEvents(groupId, () => {
      void load();
    });

    return () => { subRef.current?.unsubscribe(); };
  }, [load, groupId]);

  const nameFor = (id: string | null | undefined) => {
    if (!id) return 'Someone';
    const name = displayName(memberNames[id] ?? id);
    return id === currentPlayerId ? `${name} (you)` : name;
  };

  const handlePress = (entry: FeedEntry) => {
    if (entry.type === 'manchester_created' || entry.type === 'manchester_resolved' || entry.type === 'slap_delivered') {
      navigation.navigate('ResolutionConfirmation', {
        debtId: entry.refId,
        groupId,
        groupName,
      });
    }
    // chug_event and member_joined have no detail screen yet
  };

  if (loading) return <ActivityIndicator style={styles.center} color={color.accent} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={feed}
        keyExtractor={(e) => e.entryId}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<Text style={styles.screenTitle}>Feed</Text>}
        ListEmptyComponent={<Text style={styles.empty}>No activity yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.card, { borderLeftColor: EVENT_COLOR[item.type] }]}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.eventLabel, { color: EVENT_COLOR[item.type] }]}>
                {EVENT_LABEL[item.type]}
              </Text>
              <Text style={styles.date}>
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
            </View>
            <Text style={styles.summary}>{item.summary}</Text>
            <Text style={styles.actor}>{nameFor(item.actorId)}</Text>
          </TouchableOpacity>
        )}
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
  card: {
    backgroundColor: color.surface,
    borderLeftWidth: 3,
    padding: space.md,
    marginBottom: space.sm,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: space.xs,
  },
  eventLabel: { ...label, color: color.accent },
  date: { fontSize: size.label, color: color.textDim },
  summary: { fontSize: size.body, color: color.text, marginTop: space.xs, lineHeight: 20 },
  actor: { fontSize: size.caption, color: color.textMuted, marginTop: space.sm },
});

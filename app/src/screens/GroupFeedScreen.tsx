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

type Props = NativeStackScreenProps<GroupStackParamList, never>;

const EVENT_ICON: Record<FeedEntryType, string> = {
  manchester_created: '🎯',
  manchester_resolved: '⚖️',
  slap_delivered: '👋',
  chug_event: '🍺',
  member_joined: '👋',
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
    const name = memberNames[id] ?? id;
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

  if (loading) return <ActivityIndicator style={styles.center} />;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={feed}
        keyExtractor={(e) => e.entryId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>No activity yet</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => handlePress(item)}
            activeOpacity={0.7}
          >
            <View style={styles.row}>
              <Text style={styles.icon}>{EVENT_ICON[item.type]}</Text>
              <View style={styles.content}>
                <View style={styles.cardHeader}>
                  <Text style={styles.eventLabel}>{EVENT_LABEL[item.type]}</Text>
                  <Text style={styles.date}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={styles.summary}>{item.summary}</Text>
                <Text style={styles.actor}>by {nameFor(item.actorId)}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1 },
  list: { padding: 16, paddingBottom: 40 },
  error: { color: '#FF3B30', margin: 16 },
  empty: { fontSize: 14, color: '#aaa', textAlign: 'center', marginTop: 40 },
  card: {
    borderWidth: 1, borderColor: '#eee', borderRadius: 10,
    padding: 12, marginBottom: 10, backgroundColor: '#fafafa',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  icon: { fontSize: 24, marginRight: 12, marginTop: 2 },
  content: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  eventLabel: { fontSize: 13, fontWeight: '700', color: '#333' },
  date: { fontSize: 12, color: '#888' },
  summary: { fontSize: 13, color: '#555' },
  actor: { fontSize: 11, color: '#aaa', marginTop: 4 },
});

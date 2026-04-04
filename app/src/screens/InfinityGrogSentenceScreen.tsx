import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { GrogService } from '../services/GrogService';
import { GroupService } from '../services/GroupService';
import type { Grog, GrogHistoryEvent, LiquorCategory, Member } from '../types';
import GrogSkull from './components/GrogSkull';
import AddLiquorSheet from './components/AddLiquorSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'InfinityGrogSentence'>;

function buildMemberMap(members: Member[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of members) {
    map.set(m.playerId, m.username ?? m.playerId);
  }
  return map;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function InfinityGrogSentenceScreen({ route, navigation }: Props) {
  const { debtId, groupId, groupName } = route.params;

  const [grog, setGrog] = useState<Grog | null>(null);
  const [memberMap, setMemberMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLiquor, setShowAddLiquor] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedGrog, fetchedMembers] = await Promise.all([
        GrogService.getGrog(groupId),
        GroupService.getGroupMembers(groupId),
      ]);
      setGrog(fetchedGrog);
      setMemberMap(buildMemberMap(fetchedMembers));
    } catch (err) {
      console.error('[InfinityGrogSentenceScreen] load:', err);
      setError('Failed to load grog data.');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleTakeTheShot = () => {
    setShowAddLiquor(true);
  };

  const handleAddLiquorSubmit = async (category: LiquorCategory, brand: string) => {
    setShowAddLiquor(false);
    await confirmDelivery({ category, brand });
  };

  const handleSkipAddLiquor = async () => {
    setShowAddLiquor(false);
    await confirmDelivery(undefined);
  };

  const confirmDelivery = async (addBack?: { category: LiquorCategory; brand: string }) => {
    setConfirming(true);
    try {
      await GrogService.confirmGrogDelivery(groupId, debtId, addBack);
      navigation.goBack();
    } catch (err) {
      console.error('[InfinityGrogSentenceScreen] confirmGrogDelivery:', err);
      setError('Failed to confirm delivery. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const renderHistoryEvent = (event: GrogHistoryEvent) => {
    const actor = memberMap.get(event.actorPlayerId) ?? event.actorPlayerId;
    const when = formatDate(event.occurredAt);
    let description: string;
    if (event.type === 'addition') {
      description = `${actor} added ${event.brand ?? '?'} (${(event.category ?? '').replace(/_/g, ' ')})`;
      if (event.amountMl != null) {
        description += ` — ${event.amountMl.toFixed(1)} mL`;
      }
    } else {
      description = `${actor} took a shot`;
      if (event.amountMl != null) {
        description += ` (${event.amountMl.toFixed(1)} mL)`;
      }
    }
    return (
      <View key={event.eventId} style={styles.historyRow}>
        <Text style={styles.historyDesc}>{description}</Text>
        <Text style={styles.historyDate}>{when}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF3B30" />
      </View>
    );
  }

  if (error && !confirming && grog === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const entries = grog?.entries ?? [];
  const bottleSize = grog?.bottleSize ?? 750;
  const history = grog?.history ?? [];

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.groupName}>{groupName}</Text>
        <Text style={styles.heading}>Your Sentence</Text>
        <Text style={styles.subheading}>You must take a shot from the Grog.</Text>
        <View style={styles.skullContainer}>
          <GrogSkull entries={entries} bottleSize={bottleSize} animate={true} />
        </View>
        {error != null && (
          <Text style={styles.inlineError}>{error}</Text>
        )}
        <TouchableOpacity
          style={[styles.shotBtn, confirming && styles.shotBtnDisabled]}
          onPress={handleTakeTheShot}
          disabled={confirming}
          activeOpacity={0.8}
        >
          <Text style={styles.shotBtnText}>
            {confirming ? 'Confirming...' : 'Take the Shot'}
          </Text>
        </TouchableOpacity>
        {history.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              {`Grog History (${history.length} ${history.length === 1 ? 'event' : 'events'})`}
            </Text>
            {[...history].reverse().map(renderHistoryEvent)}
          </>
        )}
        {history.length === 0 && (
          <Text style={styles.emptyHistory}>No history yet.</Text>
        )}
      </ScrollView>
      {showAddLiquor && (
        <AddLiquorSheet
          onSubmit={(category, brand) => void handleAddLiquorSubmit(category, brand)}
          onClose={() => void handleSkipAddLiquor()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  content: { padding: 24, paddingBottom: 60, alignItems: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },
  groupName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginTop: 60,
  },
  heading: { fontSize: 32, fontWeight: '800', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subheading: { fontSize: 16, color: '#888', textAlign: 'center', marginBottom: 32 },
  skullContainer: { alignItems: 'center', marginBottom: 40 },
  shotBtn: {
    backgroundColor: '#FF3B30',
    paddingVertical: 18,
    paddingHorizontal: 48,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 40,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  shotBtnDisabled: { opacity: 0.5 },
  shotBtnText: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    alignSelf: 'flex-start',
    width: '100%',
  },
  historyRow: { borderBottomWidth: 1, borderBottomColor: '#1a1a1a', paddingVertical: 10, width: '100%' },
  historyDesc: { color: '#ccc', fontSize: 14 },
  historyDate: { color: '#444', fontSize: 11, marginTop: 2 },
  emptyHistory: { color: '#444', fontSize: 14, fontStyle: 'italic', marginTop: 8 },
  inlineError: { color: '#FF3B30', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  errorText: { color: '#FF3B30', fontSize: 15, marginBottom: 16, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: { backgroundColor: '#FF3B30', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
});

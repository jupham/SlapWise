import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { GrogService } from '../services/GrogService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import type { Grog, GrogEntry, GrogHistoryEvent, LiquorCategory, Member } from '../types';
import GrogSkull from './components/GrogSkull';
import AddLiquorSheet from './components/AddLiquorSheet';
import InitializeGrogSheet from './components/InitializeGrogSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'InfinityGrogReview'>;

const OZ_PER_ML = 1 / 29.5735;

function mlToOz(ml: number): string {
  return (ml * OZ_PER_ML).toFixed(2);
}

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

// ── Component ─────────────────────────────────────────────────────────────────

export default function InfinityGrogReviewScreen({ route, navigation }: Props) {
  const { groupId, groupName } = route.params;

  const player = useStore((s) => s.player);

  const [grog, setGrog] = useState<Grog | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, string>>(new Map());
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sheet visibility
  const [showAddLiquor, setShowAddLiquor] = useState(false);
  const [showInitialize, setShowInitialize] = useState(false);

  // Per-entry editable amountMl state: entryId → draft string value
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [adjusting, setAdjusting] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fetchedGrog, fetchedMembers] = await Promise.all([
        GrogService.getGrog(groupId),
        GroupService.getGroupMembers(groupId),
      ]);

      // getGrog returns null when no grog exists (per Req 4.2 — empty entries/history)
      // We treat a grog with no entries and no history as "not initialized" only if
      // the server returns null; otherwise we show the empty state.
      const resolvedGrog =
        fetchedGrog &&
        (fetchedGrog.entries.length > 0 ||
          fetchedGrog.history.length > 0 ||
          fetchedGrog.bottleSize > 0)
          ? fetchedGrog
          : null;

      setGrog(resolvedGrog);
      setMembers(fetchedMembers);
      setMemberMap(buildMemberMap(fetchedMembers));

      // Admin check: player is admin if their playerId is in adminIds
      // We need the group metadata for adminIds — use the members list to find the group
      // GroupService.getGroup gives us adminIds
      if (player) {
        try {
          const group = await GroupService.getGroup(groupId);
          setIsAdmin(
            group.adminIds.includes(player.playerId) ||
              group.creatorId === player.playerId,
          );
        } catch (adminErr) {
          console.error('[InfinityGrogReviewScreen] admin check:', adminErr);
          setIsAdmin(false);
        }
      }
    } catch (err) {
      console.error('[InfinityGrogReviewScreen] load:', err);
      setError('Failed to load grog data.');
    } finally {
      setLoading(false);
    }
  }, [groupId, player]);

  useEffect(() => {
    navigation.setOptions({ title: groupName });
    void load();
  }, [load, navigation, groupName]);

  // ── Admin actions ────────────────────────────────────────────────────────────

  const handleAddLiquor = async (category: LiquorCategory, brand: string) => {
    setShowAddLiquor(false);
    try {
      const updated = await GrogService.addLiquor(groupId, category, brand);
      setGrog(updated);
    } catch (err) {
      console.error('[InfinityGrogReviewScreen] addLiquor:', err);
    }
  };

  const handleRemove = async (entryId: string) => {
    setRemoving((prev) => ({ ...prev, [entryId]: true }));
    try {
      const updated = await GrogService.removeLiquor(groupId, entryId);
      setGrog(updated);
    } catch (err) {
      console.error('[InfinityGrogReviewScreen] removeLiquor:', err);
    } finally {
      setRemoving((prev) => ({ ...prev, [entryId]: false }));
    }
  };

  const handleAdjust = async (entry: GrogEntry) => {
    const draft = amountDrafts[entry.entryId];
    const parsed = draft !== undefined ? parseFloat(draft) : NaN;
    if (isNaN(parsed) || parsed < 0) return;

    setAdjusting((prev) => ({ ...prev, [entry.entryId]: true }));
    try {
      const updated = await GrogService.adjustGrogEntry(groupId, entry.entryId, parsed);
      setGrog(updated);
      setAmountDrafts((prev) => {
        const next = { ...prev };
        delete next[entry.entryId];
        return next;
      });
    } catch (err) {
      console.error('[InfinityGrogReviewScreen] adjustGrogEntry:', err);
    } finally {
      setAdjusting((prev) => ({ ...prev, [entry.entryId]: false }));
    }
  };

  const handleInitializeSuccess = () => {
    setShowInitialize(false);
    void load();
  };

  // ── Render helpers ───────────────────────────────────────────────────────────

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

  const renderEntry = (entry: GrogEntry) => {
    const draftValue =
      amountDrafts[entry.entryId] !== undefined
        ? amountDrafts[entry.entryId]
        : entry.amountMl.toFixed(1);

    return (
      <View key={entry.entryId} style={styles.entryRow}>
        <View style={styles.entryInfo}>
          <Text style={styles.entryBrand}>{entry.brand}</Text>
          <Text style={styles.entryCategory}>{entry.category.replace(/_/g, ' ')}</Text>
          <Text style={styles.entryVolume}>
            {entry.amountMl.toFixed(1)} mL / {mlToOz(entry.amountMl)} oz
          </Text>
        </View>

        {isAdmin && (
          <View style={styles.entryAdminControls}>
            <TextInput
              style={styles.amountInput}
              value={draftValue}
              onChangeText={(t) =>
                setAmountDrafts((prev) => ({ ...prev, [entry.entryId]: t }))
              }
              keyboardType="decimal-pad"
              selectTextOnFocus
            />
            <TouchableOpacity
              style={[styles.adjustBtn, adjusting[entry.entryId] && styles.btnDisabled]}
              onPress={() => void handleAdjust(entry)}
              disabled={adjusting[entry.entryId]}
            >
              <Text style={styles.adjustBtnText}>
                {adjusting[entry.entryId] ? '…' : 'Set'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.removeBtn, removing[entry.entryId] && styles.btnDisabled]}
              onPress={() => void handleRemove(entry.entryId)}
              disabled={removing[entry.entryId]}
            >
              <Text style={styles.removeBtnText}>
                {removing[entry.entryId] ? '…' : 'Remove'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ── Loading / error states ───────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FF3B30" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void load()}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.heading}>The Grog</Text>

        {/* Skull visualization */}
        <View style={styles.skullContainer}>
          <GrogSkull
            entries={grog?.entries ?? []}
            bottleSize={grog?.bottleSize ?? 750}
            animate={false}
          />
        </View>

        {/* Initialize Grog — shown when admin and no grog */}
        {isAdmin && grog === null && (
          <TouchableOpacity
            style={styles.initBtn}
            onPress={() => setShowInitialize(true)}
          >
            <Text style={styles.initBtnText}>Initialize Grog</Text>
          </TouchableOpacity>
        )}

        {/* Admin: Add Liquor */}
        {isAdmin && grog !== null && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowAddLiquor(true)}
          >
            <Text style={styles.addBtnText}>+ Add Liquor</Text>
          </TouchableOpacity>
        )}

        {/* Entry list */}
        {grog !== null && (
          <>
            <Text style={styles.sectionTitle}>
              Contents ({grog.entries.length} {grog.entries.length === 1 ? 'entry' : 'entries'})
            </Text>
            {grog.entries.length === 0 ? (
              <Text style={styles.emptyText}>No liquors in the grog yet.</Text>
            ) : (
              grog.entries.map(renderEntry)
            )}
          </>
        )}

        {/* History log */}
        {grog !== null && (
          <>
            <Text style={styles.sectionTitle}>
              History ({grog.history.length} {grog.history.length === 1 ? 'event' : 'events'})
            </Text>
            {grog.history.length === 0 ? (
              <Text style={styles.emptyText}>No history yet.</Text>
            ) : (
              [...grog.history].reverse().map(renderHistoryEvent)
            )}
          </>
        )}

        {grog === null && !isAdmin && (
          <Text style={styles.emptyText}>The grog has not been initialized yet.</Text>
        )}
      </ScrollView>

      {/* Sheets */}
      {showAddLiquor && (
        <AddLiquorSheet
          onSubmit={handleAddLiquor}
          onClose={() => setShowAddLiquor(false)}
        />
      )}

      {showInitialize && (
        <InitializeGrogSheet
          groupId={groupId}
          onSuccess={handleInitializeSuccess}
          onClose={() => setShowInitialize(false)}
        />
      )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  skullContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  initBtn: {
    backgroundColor: '#FF3B30',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  initBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  addBtn: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  addBtnText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 10,
    marginTop: 8,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  // Entry row
  entryRow: {
    backgroundColor: '#1e1e1e',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  entryInfo: {
    marginBottom: 8,
  },
  entryBrand: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  entryCategory: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  entryVolume: {
    color: '#ccc',
    fontSize: 13,
    marginTop: 4,
  },
  entryAdminControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  amountInput: {
    flex: 1,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 14,
  },
  adjustBtn: {
    backgroundColor: '#2a7aff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  adjustBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  removeBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  removeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  // History row
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    paddingVertical: 10,
  },
  historyDesc: {
    color: '#ddd',
    fontSize: 14,
  },
  historyDate: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  // Error state
  errorText: {
    color: '#FF3B30',
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});

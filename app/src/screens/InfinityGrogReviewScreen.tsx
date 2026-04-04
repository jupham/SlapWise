import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import type { Grog, GrogEntry, GrogHistoryEvent, LiquorCategory, Member, PendingAddBack } from '../types';
import GrogSkull from './components/GrogSkull';
import AddLiquorSheet from './components/AddLiquorSheet';
import InitializeGrogSheet from './components/InitializeGrogSheet';
import { CATEGORY_COLORS } from '../constants/grog';

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

  // Manage mode
  const [manageMode, setManageMode] = useState(false);

  // Sheet visibility
  const [showAddLiquor, setShowAddLiquor] = useState(false);
  const [showInitialize, setShowInitialize] = useState(false);

  // Pending add-back "Add Shot" sheet: tracks which debtId is being acted on
  const [pendingAddBackDebtId, setPendingAddBackDebtId] = useState<string | null>(null);

  // Per-pending-add-back inline errors
  const [pendingErrors, setPendingErrors] = useState<Record<string, string>>({});
  const [clearingDebtId, setClearingDebtId] = useState<string | null>(null);

  // Drawer
  const DRAWER_WIDTH = Dimensions.get('window').width * 0.72;
  const drawerAnim = useRef(new Animated.Value(DRAWER_WIDTH)).current;
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => {
    const toValue = drawerOpen ? DRAWER_WIDTH : 0;
    Animated.spring(drawerAnim, { toValue, useNativeDriver: true, damping: 20, stiffness: 120 }).start();
    setDrawerOpen(!drawerOpen);
  };

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

  // Set up navigation header — title + manage button for admins
  useEffect(() => {
    const title = manageMode ? 'Managing Grog' : groupName;
    if (isAdmin) {
      navigation.setOptions({
        title,
        headerRight: () => (
          <TouchableOpacity
            onPress={() => setManageMode((prev) => !prev)}
            style={styles.headerBtn}
          >
            <Text style={styles.headerBtnText}>{manageMode ? 'Done' : 'Manage'}</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ title: groupName, headerRight: undefined });
    }
  }, [isAdmin, manageMode, navigation, groupName]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const handleClearAddBack = async (debtId: string) => {
    setClearingDebtId(debtId);
    setPendingErrors((prev) => ({ ...prev, [debtId]: '' }));
    try {
      const updated = await GrogService.clearAddBack(groupId, debtId);
      setGrog(updated);
    } catch (err) {
      console.error('[InfinityGrogReviewScreen] clearAddBack:', err);
      setPendingErrors((prev) => ({ ...prev, [debtId]: 'Failed to clear. Try again.' }));
    } finally {
      setClearingDebtId(null);
    }
  };

  const handleAdminAddBack = async (category: LiquorCategory, brand: string) => {
    if (!pendingAddBackDebtId) return;
    const debtId = pendingAddBackDebtId;
    setPendingAddBackDebtId(null);
    setPendingErrors((prev) => ({ ...prev, [debtId]: '' }));
    try {
      const updated = await GrogService.adminAddBack(groupId, debtId, category, brand);
      setGrog(updated);
    } catch (err) {
      console.error('[InfinityGrogReviewScreen] adminAddBack:', err);
      setPendingErrors((prev) => ({ ...prev, [debtId]: 'Failed to add shot. Try again.' }));
    }
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

  const renderPendingAddBack = (entry: PendingAddBack) => {
    const username = memberMap.get(entry.debtorId) ?? entry.debtorId;
    const date = formatDate(entry.createdAt);
    const isClearing = clearingDebtId === entry.debtId;
    const rowError = pendingErrors[entry.debtId];

    return (
      <View key={entry.debtId} style={styles.pendingRow}>
        <View style={styles.pendingInfo}>
          <Text style={styles.pendingUsername}>{username}</Text>
          <Text style={styles.pendingDate}>{date}</Text>
          {rowError ? <Text style={styles.pendingError}>{rowError}</Text> : null}
        </View>
        <View style={styles.pendingActions}>
          <TouchableOpacity
            style={[styles.addShotBtn, isClearing && styles.btnDisabled]}
            onPress={() => setPendingAddBackDebtId(entry.debtId)}
            disabled={isClearing}
          >
            <Text style={styles.addShotBtnText}>Add Shot</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.clearBtn, isClearing && styles.btnDisabled]}
            onPress={() => void handleClearAddBack(entry.debtId)}
            disabled={isClearing}
          >
            <Text style={styles.clearBtnText}>{isClearing ? '…' : 'Clear'}</Text>
          </TouchableOpacity>
        </View>
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

  const pendingAddBacks = grog?.pendingAddBacks ?? [];

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <>
      <View style={styles.root}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <Text style={styles.heading}>The Grog</Text>

          <View style={styles.skullContainer}>
            <GrogSkull
              entries={grog?.entries ?? []}
              bottleSize={grog?.bottleSize ?? 750}
              animate={false}
              slosh
            />
          </View>

          {/* Initialize Grog — only in manage mode */}
          {manageMode && grog === null && (
            <TouchableOpacity style={styles.initBtn} onPress={() => setShowInitialize(true)}>
              <Text style={styles.initBtnText}>Initialize Grog</Text>
            </TouchableOpacity>
          )}

          {grog === null && !manageMode && (
            <Text style={styles.emptyText}>The grog has not been initialized yet.</Text>
          )}

          {/* Pending Add-Backs section — manage mode only */}
          {manageMode && pendingAddBacks.length > 0 && (
            <View style={styles.pendingSection}>
              <Text style={styles.sectionTitle}>Pending Add-Backs</Text>
              {pendingAddBacks.map(renderPendingAddBack)}
            </View>
          )}

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
        </ScrollView>

        {/* Drawer toggle tab */}
        {grog !== null && grog.entries.length > 0 && (
          <TouchableOpacity style={styles.drawerTab} onPress={toggleDrawer}>
            <Text style={styles.drawerTabText}>{drawerOpen ? '› Contents' : '‹ Contents'}</Text>
          </TouchableOpacity>
        )}

        {/* Slide-in drawer */}
        <Animated.View style={[styles.drawer, { transform: [{ translateX: drawerAnim }] }]}>
          <ScrollView contentContainerStyle={styles.drawerContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.drawerTitle}>Contents</Text>
            {/* Add Liquor button — manage mode only */}
            {manageMode && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddLiquor(true)}>
                <Text style={styles.addBtnText}>+ Add Liquor</Text>
              </TouchableOpacity>
            )}
            {grog?.entries.map((entry) => {
              const color = CATEGORY_COLORS[entry.category];
              const draftValue =
                amountDrafts[entry.entryId] !== undefined
                  ? amountDrafts[entry.entryId]
                  : entry.amountMl.toFixed(1);
              return (
                <View key={entry.entryId} style={[styles.entryRow, { borderLeftColor: color }]}>
                  <View style={[styles.colorDot, { backgroundColor: color }]} />
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryBrand} numberOfLines={1}>{entry.brand}</Text>
                    <Text style={styles.entryCategory}>{entry.category.replace(/_/g, ' ')}</Text>
                    <Text style={styles.entryVolume}>{entry.amountMl.toFixed(1)} mL / {mlToOz(entry.amountMl)} oz</Text>
                  </View>
                  {/* Per-entry admin controls — manage mode only */}
                  {manageMode && (
                    <View style={styles.entryAdminControls}>
                      <TextInput
                        style={styles.amountInput}
                        value={draftValue}
                        onChangeText={(t) => setAmountDrafts((prev) => ({ ...prev, [entry.entryId]: t }))}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                      />
                      <TouchableOpacity
                        style={[styles.adjustBtn, adjusting[entry.entryId] && styles.btnDisabled]}
                        onPress={() => void handleAdjust(entry)}
                        disabled={adjusting[entry.entryId]}
                      >
                        <Text style={styles.adjustBtnText}>{adjusting[entry.entryId] ? '…' : '✓'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.removeBtn, removing[entry.entryId] && styles.btnDisabled]}
                        onPress={() => void handleRemove(entry.entryId)}
                        disabled={removing[entry.entryId]}
                      >
                        <Text style={styles.removeBtnText}>{removing[entry.entryId] ? '…' : '✕'}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>

      {showAddLiquor && (
        <AddLiquorSheet onSubmit={handleAddLiquor} onClose={() => setShowAddLiquor(false)} />
      )}
      {showInitialize && (
        <InitializeGrogSheet groupId={groupId} onSuccess={handleInitializeSuccess} onClose={() => setShowInitialize(false)} />
      )}
      {pendingAddBackDebtId !== null && (
        <AddLiquorSheet
          onSubmit={handleAdminAddBack}
          onClose={() => setPendingAddBackDebtId(null)}
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
  // Header button
  headerBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  headerBtnText: {
    color: '#FF3B30',
    fontSize: 15,
    fontWeight: '600',
  },
  // Drawer
  root: {
    flex: 1,
    backgroundColor: '#111',
  },
  drawer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '72%',
    backgroundColor: '#1a1a1a',
    borderLeftWidth: 1,
    borderLeftColor: '#333',
    shadowColor: '#000',
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 16,
  },
  drawerContent: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  drawerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  drawerTab: {
    position: 'absolute',
    right: 0,
    top: 8,
    backgroundColor: '#2a2a2a',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: '#444',
    zIndex: 10,
  },
  drawerTabText: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
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
  // Pending add-backs section
  pendingSection: {
    marginBottom: 20,
  },
  pendingRow: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingInfo: {
    flex: 1,
  },
  pendingUsername: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  pendingDate: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  pendingError: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addShotBtn: {
    backgroundColor: '#FF3B30',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addShotBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  clearBtn: {
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearBtnText: {
    color: '#aaa',
    fontSize: 12,
    fontWeight: '600',
  },
  // Entry row
  entryRow: {
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
    borderLeftWidth: 3,
    padding: 8,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  entryInfo: {
    flex: 1,
    minWidth: 0,
  },
  entryBrand: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  entryCategory: {
    color: '#888',
    fontSize: 10,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  entryVolume: {
    color: '#aaa',
    fontSize: 10,
    marginTop: 1,
  },
  entryAdminControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  amountInput: {
    width: 44,
    backgroundColor: '#2a2a2a',
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 3,
    color: '#fff',
    fontSize: 11,
    textAlign: 'center',
  },
  adjustBtn: {
    backgroundColor: '#2a7aff',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  adjustBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  removeBtn: {
    backgroundColor: '#3a1a1a',
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  removeBtnText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '700',
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

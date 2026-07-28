import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GrogService } from '../services/GrogService';
import { GroupService } from '../services/GroupService';
import { useStore } from '../store';
import type { Grog, GrogEntry, GrogHistoryEvent, LiquorCategory, Member, PendingAddBack } from '../types';
import GrogSkull from './components/GrogSkull';
import AddLiquorSheet from './components/AddLiquorSheet';
import InitializeGrogSheet from './components/InitializeGrogSheet';
import { CATEGORY_COLORS } from '../constants/grog';
import { color, displayName, label, radius, space, title } from '../theme';

// ── Types ─────────────────────────────────────────────────────────────────────

const OZ_PER_ML = 1 / 29.5735;

function mlToOz(ml: number): string {
  return (ml * OZ_PER_ML).toFixed(2);
}

/**
 * Proportional removal shaves a fraction off every entry, so amounts get very
 * small without ever reaching zero. "0.0 mL" reads as a bug; this reads as
 * a trace, which is what it is.
 */
function formatMl(ml: number): string {
  return ml < 0.1 ? '< 0.1 mL' : `${ml.toFixed(1)} mL`;
}

function categoryLabel(category: LiquorCategory): string {
  return category.replace(/_/g, ' ');
}

/** Same order the skull stacks its bands in, so the two stay in step. */
const CATEGORY_ORDER = Object.keys(CATEGORY_COLORS) as LiquorCategory[];

interface CategoryGroup {
  category: LiquorCategory;
  amountMl: number;
  brands: string[];
}

/**
 * The contents list mirrors the skull: one row per liquor type, brands named
 * underneath. Returned top-of-skull first, so reading down the list matches
 * reading down the picture — the drawer used to run the other way.
 */
function groupByCategory(entries: GrogEntry[]): CategoryGroup[] {
  const groups = new Map<LiquorCategory, CategoryGroup>();
  for (const entry of entries) {
    const existing = groups.get(entry.category);
    if (existing) {
      existing.amountMl += entry.amountMl;
      if (!existing.brands.includes(entry.brand)) existing.brands.push(entry.brand);
    } else {
      groups.set(entry.category, {
        category: entry.category,
        amountMl: entry.amountMl,
        brands: [entry.brand],
      });
    }
  }
  return CATEGORY_ORDER.flatMap((category) => groups.get(category) ?? []).reverse();
}

function buildMemberMap(members: Member[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of members) {
    map.set(m.playerId, displayName(m.username ?? m.playerId));
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

export default function InfinityGrogReviewScreen() {
  // Tab screen — group comes from the store, not route params.
  const activeGroup = useStore((s) => s.activeGroup);
  const groupId = activeGroup?.groupId ?? '';

  const player = useStore((s) => s.player);
  const insets = useSafeAreaInsets();

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

  // Per-entry editable amountMl state: entryId → draft string value
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [adjusting, setAdjusting] = useState<Record<string, boolean>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  // Only the first fetch blocks on the spinner; refocus refreshes in place.
  const hasLoadedRef = useRef(false);

  const load = useCallback(async () => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    if (!hasLoadedRef.current) setLoading(true);
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
      hasLoadedRef.current = true;
      setLoading(false);
    }
  }, [groupId, player]);

  // Leaving manage mode when losing admin keeps the UI honest if the role changes.
  useEffect(() => {
    if (!isAdmin) setManageMode(false);
  }, [isAdmin]);

  // Tabs stay mounted, so refetch on focus rather than only on mount —
  // otherwise the grog goes stale after a shot is taken elsewhere.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  /** View mode: one row per liquor type, mirroring a band in the skull. */
  const renderCategoryRow = (group: CategoryGroup) => (
    <View key={group.category} style={styles.contentRow}>
      <View
        style={[styles.contentSwatch, { backgroundColor: CATEGORY_COLORS[group.category] }]}
      />
      <View style={styles.contentInfo}>
        <Text style={styles.contentCategory}>{categoryLabel(group.category)}</Text>
        <Text style={styles.contentBrands} numberOfLines={2}>
          {group.brands.join(', ')}
        </Text>
      </View>
      <Text style={styles.contentAmount}>{formatMl(group.amountMl)}</Text>
    </View>
  );

  /** Manage mode: the flat entry list, because you adjust and remove entries,
   *  not types. Every entry shows, however small — the grog forgets nothing. */
  const renderManageRow = (entry: GrogEntry) => {
    const swatch = CATEGORY_COLORS[entry.category];
    const draftValue =
      amountDrafts[entry.entryId] !== undefined
        ? amountDrafts[entry.entryId]
        : entry.amountMl.toFixed(1);
    return (
      <View key={entry.entryId} style={[styles.entryRow, { borderLeftColor: swatch }]}>
        <View style={styles.entryInfo}>
          <Text style={styles.entryBrand} numberOfLines={1}>{entry.brand}</Text>
          <Text style={styles.entryCategory}>{categoryLabel(entry.category)}</Text>
          <Text style={styles.entryVolume}>
            {formatMl(entry.amountMl)} / {mlToOz(entry.amountMl)} oz
          </Text>
        </View>
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

  if (!groupId) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No group selected.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={color.accent} />
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
  // Manage mode counts entries because that is what it lists; view mode counts
  // types, so the number matches the bands you can see in the skull.
  const entries = grog?.entries ?? [];
  const contentsCount = manageMode ? entries.length : groupByCategory(entries).length;

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <>
      <View style={styles.root}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
        >
          <Text style={styles.heading}>{manageMode ? 'Managing Grog' : 'The Grog'}</Text>

          <View style={styles.skullContainer}>
            <GrogSkull
              entries={grog?.entries ?? []}
              bottleSize={grog?.bottleSize ?? 750}
              animate={false}
              slosh
            />
          </View>

          {/* Contents. Replaces the slide-in drawer, which covered the skull it
              was describing and put its toggle on top of the Manage button.
              Manage lives here because managing the grog *is* editing contents. */}
          {(grog !== null || isAdmin) && (
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionHeaderLabel}>
                Contents{contentsCount > 0 ? ` · ${contentsCount}` : ''}
              </Text>
              {isAdmin && (
                <TouchableOpacity onPress={() => setManageMode((prev) => !prev)} hitSlop={8}>
                  <Text style={styles.sectionAction}>{manageMode ? 'Done' : 'Manage'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {grog === null ? (
            manageMode ? (
              <TouchableOpacity style={styles.initBtn} onPress={() => setShowInitialize(true)}>
                <Text style={styles.initBtnText}>Initialize Grog</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.emptyText}>The grog has not been initialized yet.</Text>
            )
          ) : manageMode ? (
            <>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddLiquor(true)}>
                <Text style={styles.addBtnText}>+ Add Liquor</Text>
              </TouchableOpacity>
              {grog.entries.map(renderManageRow)}
            </>
          ) : (
            groupByCategory(grog.entries).map(renderCategoryRow)
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
    backgroundColor: color.bg,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.bg,
  },
  heading: {
    ...title,
    marginBottom: 16,
  },
  skullContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  root: {
    flex: 1,
    backgroundColor: color.bg,
  },
  // Section header carrying an action on the right
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.lg,
    marginBottom: space.md,
  },
  sectionHeaderLabel: {
    ...label,
  },
  sectionAction: {
    color: color.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  // Contents row — one per liquor type, matching a band in the skull
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 1,
    borderBottomWidth: 1,
    borderBottomColor: color.surfaceRaised,
  },
  contentSwatch: {
    width: 4,
    height: 26,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  contentInfo: {
    flex: 1,
    minWidth: 0,
  },
  contentCategory: {
    color: color.text,
    fontSize: 15,
    textTransform: 'capitalize',
  },
  contentBrands: {
    color: color.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  contentAmount: {
    color: color.textMuted,
    fontSize: 12,
  },
  initBtn: {
    backgroundColor: color.accent,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  initBtnText: {
    color: color.text,
    fontSize: 15,
    fontWeight: '700',
  },
  addBtn: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  addBtnText: {
    color: color.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  sectionTitle: {
    ...label,
    marginBottom: space.md,
    marginTop: space.lg,
  },
  emptyText: {
    color: color.textDim,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  // Pending add-backs section
  pendingSection: {
    marginBottom: 20,
  },
  pendingRow: {
    backgroundColor: color.surface,
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
    color: color.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pendingDate: {
    color: color.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  pendingError: {
    color: color.accent,
    fontSize: 12,
    marginTop: 4,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: 8,
  },
  addShotBtn: {
    backgroundColor: color.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addShotBtnText: {
    color: color.text,
    fontSize: 12,
    fontWeight: '700',
  },
  clearBtn: {
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  clearBtnText: {
    color: color.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  // Entry row
  entryRow: {
    backgroundColor: color.surface,
    borderRadius: 6,
    borderLeftWidth: 3,
    padding: 8,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  entryInfo: {
    flex: 1,
    minWidth: 0,
  },
  entryBrand: {
    color: color.text,
    fontSize: 12,
    fontWeight: '600',
  },
  entryCategory: {
    color: color.textMuted,
    fontSize: 10,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  entryVolume: {
    color: color.textMuted,
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
    backgroundColor: color.surfaceRaised,
    borderWidth: 1,
    borderColor: color.borderStrong,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 3,
    color: color.text,
    fontSize: 11,
    textAlign: 'center',
  },
  adjustBtn: {
    backgroundColor: color.regalia,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  adjustBtnText: {
    color: color.text,
    fontSize: 11,
    fontWeight: '700',
  },
  removeBtn: {
    backgroundColor: color.surfaceRaised,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
  },
  removeBtnText: {
    color: color.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  // History row
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: color.surfaceRaised,
    paddingVertical: 10,
  },
  historyDesc: {
    color: color.text,
    fontSize: 14,
  },
  historyDate: {
    color: color.textDim,
    fontSize: 11,
    marginTop: 2,
  },
  // Error state
  errorText: {
    color: color.accent,
    fontSize: 15,
    marginBottom: 16,
    textAlign: 'center',
  },
  retryBtn: {
    backgroundColor: color.accent,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: color.text,
    fontWeight: '600',
    fontSize: 14,
  },
});

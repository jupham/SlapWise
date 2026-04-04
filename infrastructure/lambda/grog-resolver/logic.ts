/**
 * Pure logic functions extracted from grog-resolver for testability.
 * No DynamoDB or I/O dependencies — safe to import in unit/property tests.
 */

export const SHOT_ML = 44.36;

export interface GrogEntry {
  entryId: string;
  category: string;
  brand: string;
  amountMl: number;
}

export interface GrogHistoryEvent {
  eventId: string;
  type: string;
  actorPlayerId: string;
  occurredAt: string;
  sourceDebtId: string | null;
  brand: string | null;
  category: string | null;
  amountMl: number | null;
}

export interface AddLiquorInput {
  category: string;
  brand: string;
  amountMl?: number;
}

// ── addLiquor logic ───────────────────────────────────────────────────────────

/**
 * Merges a new liquor into the entries list.
 * If an entry with the same brand+category exists, increments amountMl by SHOT_ML.
 * Otherwise appends a new entry with amountMl = SHOT_ML.
 */
export function applyAddLiquor(
  entries: GrogEntry[],
  input: AddLiquorInput,
  newEntryId: string,
): GrogEntry[] {
  const result = entries.map(e => ({ ...e }));
  const existing = result.find(
    e => e.brand === input.brand && e.category === input.category,
  );
  if (existing) {
    existing.amountMl += SHOT_ML;
    return result;
  }
  return [
    ...result,
    { entryId: newEntryId, category: input.category, brand: input.brand, amountMl: SHOT_ML },
  ];
}

/**
 * Builds the addition history event for an addLiquor operation.
 */
export function makeAdditionEvent(
  input: AddLiquorInput,
  actorPlayerId: string,
  eventId: string,
  occurredAt: string,
  sourceDebtId: string | null = null,
): GrogHistoryEvent {
  return {
    eventId,
    type: 'addition',
    actorPlayerId,
    occurredAt,
    sourceDebtId,
    brand: input.brand,
    category: input.category,
    amountMl: SHOT_ML,
  };
}

// ── removeLiquor logic ────────────────────────────────────────────────────────

/**
 * Removes the entry with the given entryId.
 * Returns null if the entryId does not exist.
 */
export function applyRemoveLiquor(
  entries: GrogEntry[],
  entryId: string,
): GrogEntry[] | null {
  if (!entries.some(e => e.entryId === entryId)) return null;
  return entries.filter(e => e.entryId !== entryId);
}

// ── confirmGrogDelivery logic ─────────────────────────────────────────────────

/**
 * Applies proportional removal of one SHOT_ML across all entries.
 * Entries whose amountMl drops to ≤ 0.01 mL are removed.
 * Returns entries unchanged if totalAmountMl is 0.
 */
export function applyProportionalRemoval(entries: GrogEntry[]): GrogEntry[] {
  const totalAmountMl = entries.reduce((sum, e) => sum + e.amountMl, 0);
  if (totalAmountMl <= 0) return entries.map(e => ({ ...e }));
  return entries
    .map(e => ({
      ...e,
      amountMl: e.amountMl - SHOT_ML * (e.amountMl / totalAmountMl),
    }))
    .filter(e => e.amountMl > 0.01);
}

/**
 * Full confirmGrogDelivery state transition (pure).
 * Returns the new [entries, history] tuple.
 */
export function applyConfirmDelivery(
  entries: GrogEntry[],
  history: GrogHistoryEvent[],
  actorPlayerId: string,
  debtId: string,
  now: string,
  shotEventId: string,
  addBack?: AddLiquorInput,
  addBackEntryId?: string,
  addBackEventId?: string,
): [GrogEntry[], GrogHistoryEvent[]] {
  let newEntries = applyProportionalRemoval(entries);
  const newHistory = [...history];

  newHistory.push({
    eventId: shotEventId,
    type: 'shot_taken',
    actorPlayerId,
    occurredAt: now,
    sourceDebtId: debtId,
    brand: null,
    category: null,
    amountMl: SHOT_ML,
  });

  if (addBack && addBackEntryId != null && addBackEventId != null) {
    newEntries = applyAddLiquor(newEntries, addBack, addBackEntryId);
    newHistory.push(makeAdditionEvent(addBack, actorPlayerId, addBackEventId, now, debtId));
  }

  return [newEntries, newHistory];
}

// ── initializeGrog logic ──────────────────────────────────────────────────────

/**
 * Validates that seed entries don't overflow the bottle.
 * Returns true if valid, false if overflow.
 */
export function validateSeedEntries(
  seedEntries: AddLiquorInput[],
  bottleSize: number,
): boolean {
  const total = seedEntries.reduce((sum, se) => sum + (se.amountMl ?? SHOT_ML), 0);
  return total <= bottleSize;
}

/**
 * Builds the initial entries and history for initializeGrog (pure).
 */
export function buildInitialGrog(
  seedEntries: AddLiquorInput[],
  actorPlayerId: string,
  now: string,
  ids: Array<{ entryId: string; eventId: string }>,
): { entries: GrogEntry[]; history: GrogHistoryEvent[] } {
  const entries: GrogEntry[] = seedEntries.map((se, i) => ({
    entryId: ids[i].entryId,
    category: se.category,
    brand: se.brand,
    amountMl: se.amountMl ?? SHOT_ML,
  }));
  const history: GrogHistoryEvent[] = seedEntries.map((se, i) => ({
    eventId: ids[i].eventId,
    type: 'addition',
    actorPlayerId,
    occurredAt: now,
    sourceDebtId: null,
    brand: se.brand,
    category: se.category,
    amountMl: se.amountMl ?? SHOT_ML,
  }));
  return { entries, history };
}

// ── takeGrogShot logic ────────────────────────────────────────────────────────

export interface PendingAddBack {
  debtId: string;
  debtorId: string;
  createdAt: string;
}

/**
 * Applies proportional removal + appends shot_taken event + appends a PendingAddBack.
 * Returns [newEntries, newHistory, newPendingAddBacks].
 */
export function applyTakeGrogShot(
  entries: GrogEntry[],
  history: GrogHistoryEvent[],
  pendingAddBacks: PendingAddBack[],
  debtorId: string,
  debtId: string,
  now: string,
  shotEventId: string,
): [GrogEntry[], GrogHistoryEvent[], PendingAddBack[]] {
  const newEntries = applyProportionalRemoval(entries);
  const newHistory: GrogHistoryEvent[] = [
    ...history,
    {
      eventId: shotEventId,
      type: 'shot_taken',
      actorPlayerId: debtorId,
      occurredAt: now,
      sourceDebtId: debtId,
      brand: null,
      category: null,
      amountMl: SHOT_ML,
    },
  ];
  const newPendingAddBacks: PendingAddBack[] = [
    ...pendingAddBacks,
    { debtId, debtorId, createdAt: now },
  ];
  return [newEntries, newHistory, newPendingAddBacks];
}

// ── redeemAddBack logic ───────────────────────────────────────────────────────

/**
 * Applies add-back merge logic + removes matching pendingAddBacks entry + appends addition event.
 * Returns null if debtId not found in pendingAddBacks.
 */
export function applyRedeemAddBack(
  entries: GrogEntry[],
  history: GrogHistoryEvent[],
  pendingAddBacks: PendingAddBack[],
  debtId: string,
  input: AddLiquorInput,
  actorPlayerId: string,
  now: string,
  newEntryId: string,
  eventId: string,
): [GrogEntry[], GrogHistoryEvent[], PendingAddBack[]] | null {
  const matchIndex = pendingAddBacks.findIndex(p => p.debtId === debtId);
  if (matchIndex === -1) return null;

  const newEntries = applyAddLiquor(entries, input, newEntryId);
  const newHistory: GrogHistoryEvent[] = [
    ...history,
    makeAdditionEvent(input, actorPlayerId, eventId, now, debtId),
  ];
  const newPendingAddBacks = pendingAddBacks.filter((_, i) => i !== matchIndex);
  return [newEntries, newHistory, newPendingAddBacks];
}

// ── clearAddBack logic ────────────────────────────────────────────────────────

/**
 * Removes matching pendingAddBacks entry without touching entries or history.
 * Returns null if debtId not found.
 */
export function applyClearAddBack(
  pendingAddBacks: PendingAddBack[],
  debtId: string,
): PendingAddBack[] | null {
  const matchIndex = pendingAddBacks.findIndex(p => p.debtId === debtId);
  if (matchIndex === -1) return null;
  return pendingAddBacks.filter((_, i) => i !== matchIndex);
}

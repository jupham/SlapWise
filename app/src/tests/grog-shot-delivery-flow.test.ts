/**
 * Property-based tests for the grog shot delivery flow.
 * Feature: grog-shot-delivery-flow
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { expect } from 'vitest';
import {
  SHOT_ML,
  applyTakeGrogShot,
  type GrogEntry,
  type GrogHistoryEvent,
  type PendingAddBack,
} from '../../../infrastructure/lambda/grog-resolver/logic';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'vodka', 'whiskey', 'bourbon', 'scotch', 'irish_whiskey',
  'canadian_whiskey', 'rum', 'gin', 'tequila', 'brandy', 'other',
] as const;

const arbCategory = fc.constantFrom(...CATEGORIES);

const arbBrand = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0);

const grogEntryArb = fc.record<GrogEntry>({
  entryId: fc.uuid(),
  category: arbCategory,
  brand: arbBrand,
  amountMl: fc.float({ min: Math.fround(0.02), max: Math.fround(5000), noNaN: true }),
});

const grogHistoryEventArb = fc.record<GrogHistoryEvent>({
  eventId: fc.uuid(),
  type: fc.constantFrom('addition' as const, 'shot_taken' as const),
  actorPlayerId: fc.uuid(),
  occurredAt: fc.constant('2025-01-01T00:00:00.000Z'),
  sourceDebtId: fc.option(fc.uuid(), { nil: null }),
  brand: fc.option(arbBrand, { nil: null }),
  category: fc.option(arbCategory, { nil: null }),
  amountMl: fc.option(
    fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
    { nil: null },
  ),
});

const pendingAddBackArb = fc.record<PendingAddBack>({
  debtId: fc.uuid(),
  debtorId: fc.uuid(),
  createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
});

// ── Property 2: takeGrogShot appends exactly one PendingAddBack with correct fields ──
// Validates: Requirements 2.5, 4.2, 4.3

describe('Feature: grog-shot-delivery-flow, Property 2 — takeGrogShot appends exactly one PendingAddBack with correct fields', () => {
  it('pendingAddBacks length increases by exactly 1', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // debtorId
        fc.uuid(), // debtId
        fc.constant('2025-06-01T12:00:00.000Z'), // now
        fc.uuid(), // shotEventId
        (entries, history, pendingAddBacks, debtorId, debtId, now, shotEventId) => {
          const [, , newPendingAddBacks] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, now, shotEventId,
          );

          expect(newPendingAddBacks.length).toBe(pendingAddBacks.length + 1);
        },
      ),
    );
  });

  it('the new PendingAddBack entry has debtId and debtorId matching the input args', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // debtorId
        fc.uuid(), // debtId
        fc.constant('2025-06-01T12:00:00.000Z'), // now
        fc.uuid(), // shotEventId
        (entries, history, pendingAddBacks, debtorId, debtId, now, shotEventId) => {
          const [, , newPendingAddBacks] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, now, shotEventId,
          );

          const appended = newPendingAddBacks[newPendingAddBacks.length - 1];
          expect(appended.debtId).toBe(debtId);
          expect(appended.debtorId).toBe(debtorId);
        },
      ),
    );
  });

  it('the new PendingAddBack entry has all three fields present, non-null, and non-empty', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // debtorId
        fc.uuid(), // debtId
        fc.constant('2025-06-01T12:00:00.000Z'), // now
        fc.uuid(), // shotEventId
        (entries, history, pendingAddBacks, debtorId, debtId, now, shotEventId) => {
          const [, , newPendingAddBacks] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, now, shotEventId,
          );

          const appended = newPendingAddBacks[newPendingAddBacks.length - 1];
          expect(typeof appended.debtId).toBe('string');
          expect(appended.debtId.length).toBeGreaterThan(0);
          expect(typeof appended.debtorId).toBe('string');
          expect(appended.debtorId.length).toBeGreaterThan(0);
          expect(typeof appended.createdAt).toBe('string');
          expect(appended.createdAt.length).toBeGreaterThan(0);
        },
      ),
    );
  });
});

// ── Property 7: PendingAddBack fields are all present and non-empty ──
// Validates: Requirements 4.2, 9.1

describe('Feature: grog-shot-delivery-flow, Property 7 — PendingAddBack fields are all present and non-empty', () => {
  it('all three fields (debtId, debtorId, createdAt) are present, non-null, and non-empty strings', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // debtorId
        fc.uuid(), // debtId
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map(d => d.toISOString()), // now
        fc.uuid(), // shotEventId
        (entries, history, pendingAddBacks, debtorId, debtId, now, shotEventId) => {
          const [, , newPendingAddBacks] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, now, shotEventId,
          );

          const appended = newPendingAddBacks[newPendingAddBacks.length - 1];

          // All fields must be present (not undefined or null)
          expect(appended.debtId).toBeDefined();
          expect(appended.debtorId).toBeDefined();
          expect(appended.createdAt).toBeDefined();

          // All fields must be non-empty strings
          expect(typeof appended.debtId).toBe('string');
          expect(appended.debtId.length).toBeGreaterThan(0);

          expect(typeof appended.debtorId).toBe('string');
          expect(appended.debtorId.length).toBeGreaterThan(0);

          expect(typeof appended.createdAt).toBe('string');
          expect(appended.createdAt.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it('createdAt matches the now argument passed to applyTakeGrogShot', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(),
        fc.uuid(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true }).map(d => d.toISOString()),
        fc.uuid(),
        (entries, history, pendingAddBacks, debtorId, debtId, now, shotEventId) => {
          const [, , newPendingAddBacks] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, now, shotEventId,
          );

          const appended = newPendingAddBacks[newPendingAddBacks.length - 1];
          expect(appended.createdAt).toBe(now);
        },
      ),
    );
  });
});

// ── Property 1: takeGrogShot applies proportional removal and appends shot_taken event ──
// Validates: Requirements 2.1, 2.2

describe('Feature: grog-shot-delivery-flow, Property 1 — takeGrogShot applies proportional removal and appends shot_taken event', () => {
  it('each entry amountMl is reduced proportionally', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // debtorId
        fc.uuid(), // debtId
        fc.uuid(), // shotEventId
        (entries, history, pendingAddBacks, debtorId, debtId, shotEventId) => {
          const total = entries.reduce((sum, e) => sum + e.amountMl, 0);
          fc.pre(total > SHOT_ML); // ensure entries survive so we can check proportional reduction

          const [newEntries] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, '2025-06-01T12:00:00.000Z', shotEventId,
          );

          for (const original of entries) {
            const after = newEntries.find(e => e.entryId === original.entryId);
            if (after) {
              const expected = original.amountMl - SHOT_ML * (original.amountMl / total);
              expect(after.amountMl).toBeCloseTo(expected, 4);
            }
          }
        },
      ),
    );
  });

  it('keeps every entry and never goes negative', () => {
    // Taking a shot shaves a proportion off each entry rather than draining any
    // one of them, so nothing is ever removed — a bottle poured in long ago
    // stays in the contents at a trace. A grog holding less than a full shot
    // drains to exactly zero instead of underflowing.
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(),
        fc.uuid(),
        fc.uuid(),
        (entries, history, pendingAddBacks, debtorId, debtId, shotEventId) => {
          const [newEntries] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, '2025-06-01T12:00:00.000Z', shotEventId,
          );

          expect(newEntries.map(e => e.entryId)).toEqual(entries.map(e => e.entryId));
          for (const e of newEntries) {
            expect(e.amountMl).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });

  it('appends exactly one shot_taken event to history', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb, { minLength: 1 }),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // debtorId
        fc.uuid(), // debtId
        fc.uuid(), // shotEventId
        (entries, history, pendingAddBacks, debtorId, debtId, shotEventId) => {
          const [, newHistory] = applyTakeGrogShot(
            entries, history, pendingAddBacks,
            debtorId, debtId, '2025-06-01T12:00:00.000Z', shotEventId,
          );

          expect(newHistory.length).toBe(history.length + 1);

          const appended = newHistory[newHistory.length - 1];
          expect(appended.type).toBe('shot_taken');
          expect(appended.amountMl).toBeCloseTo(SHOT_ML);
          expect(appended.sourceDebtId).toBe(debtId);
          expect(appended.actorPlayerId).toBe(debtorId);
          expect(appended.brand).toBeNull();
          expect(appended.category).toBeNull();
        },
      ),
    );
  });
});

// ── Property 3: redeemAddBack merges entries, appends addition event, removes pending entry ──
// Validates: Requirements 5.1, 5.2, 5.3, 4.4

import {
  applyRedeemAddBack,
  applyAddLiquor,
  applyClearAddBack,
  type AddLiquorInput,
} from '../../../infrastructure/lambda/grog-resolver/logic';

describe('Feature: grog-shot-delivery-flow, Property 3 — redeemAddBack merges entries, appends addition event, removes pending entry', () => {
  const addLiquorInputArb = fc.record<AddLiquorInput>({
    category: arbCategory,
    brand: arbBrand,
  });

  it('result is not null when debtId exists in pendingAddBacks', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb, { minLength: 1 }),
        addLiquorInputArb,
        fc.uuid(), // actorPlayerId
        fc.constant('2025-06-01T12:00:00.000Z'), // now
        fc.uuid(), // newEntryId
        fc.uuid(), // eventId
        (entries, history, pendingAddBacks, input, actorPlayerId, now, newEntryId, eventId) => {
          // Pick one of the existing pendingAddBacks as the target
          const target = pendingAddBacks[0];
          const result = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, actorPlayerId, now, newEntryId, eventId,
          );
          expect(result).not.toBeNull();
        },
      ),
    );
  });

  it('entries reflect the same merge logic as applyAddLiquor', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb, { minLength: 1 }),
        addLiquorInputArb,
        fc.uuid(),
        fc.constant('2025-06-01T12:00:00.000Z'),
        fc.uuid(),
        fc.uuid(),
        (entries, history, pendingAddBacks, input, actorPlayerId, now, newEntryId, eventId) => {
          const target = pendingAddBacks[0];
          const result = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, actorPlayerId, now, newEntryId, eventId,
          );
          expect(result).not.toBeNull();
          const [newEntries] = result!;

          // Compare against applyAddLiquor directly
          const expected = applyAddLiquor(entries, input, newEntryId);
          expect(newEntries).toEqual(expected);
        },
      ),
    );
  });

  it('history has exactly one more event and the new event is type addition with correct sourceDebtId', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb, { minLength: 1 }),
        addLiquorInputArb,
        fc.uuid(),
        fc.constant('2025-06-01T12:00:00.000Z'),
        fc.uuid(),
        fc.uuid(),
        (entries, history, pendingAddBacks, input, actorPlayerId, now, newEntryId, eventId) => {
          const target = pendingAddBacks[0];
          const result = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, actorPlayerId, now, newEntryId, eventId,
          );
          expect(result).not.toBeNull();
          const [, newHistory] = result!;

          expect(newHistory.length).toBe(history.length + 1);

          const appended = newHistory[newHistory.length - 1];
          expect(appended.type).toBe('addition');
          expect(appended.sourceDebtId).toBe(target.debtId);
        },
      ),
    );
  });

  it('pendingAddBacks length decreases by exactly 1 and the matched debtId is no longer present', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb, { minLength: 1 }),
        addLiquorInputArb,
        fc.uuid(),
        fc.constant('2025-06-01T12:00:00.000Z'),
        fc.uuid(),
        fc.uuid(),
        (entries, history, pendingAddBacks, input, actorPlayerId, now, newEntryId, eventId) => {
          const target = pendingAddBacks[0];
          const result = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, actorPlayerId, now, newEntryId, eventId,
          );
          expect(result).not.toBeNull();
          const [, , newPendingAddBacks] = result!;

          expect(newPendingAddBacks.length).toBe(pendingAddBacks.length - 1);
          expect(newPendingAddBacks.some(p => p.debtId === target.debtId)).toBe(false);
        },
      ),
    );
  });
});

// ── Property 4: clearAddBack removes pending entry, entries and history unchanged ──
// Feature: grog-shot-delivery-flow, Property 4
// Validates: Requirements 6.1, 4.5

describe('Feature: grog-shot-delivery-flow, Property 4 — clearAddBack removes pending entry, entries and history unchanged', () => {
  it('result is not null when debtId exists in pendingAddBacks', () => {
    fc.assert(
      fc.property(
        fc.array(pendingAddBackArb, { minLength: 1 }),
        (pendingAddBacks) => {
          const target = pendingAddBacks[0];
          const result = applyClearAddBack(pendingAddBacks, target.debtId);
          expect(result).not.toBeNull();
        },
      ),
    );
  });

  it('pendingAddBacks length decreases by exactly 1 and matched debtId is removed', () => {
    fc.assert(
      fc.property(
        fc.array(pendingAddBackArb, { minLength: 1 }),
        (pendingAddBacks) => {
          const target = pendingAddBacks[0];
          const result = applyClearAddBack(pendingAddBacks, target.debtId);
          expect(result).not.toBeNull();
          expect(result!.length).toBe(pendingAddBacks.length - 1);
          expect(result!.some(p => p.debtId === target.debtId)).toBe(false);
        },
      ),
    );
  });

  it('all other pendingAddBacks entries are preserved unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(pendingAddBackArb, { minLength: 1 }),
        (pendingAddBacks) => {
          const target = pendingAddBacks[0];
          const result = applyClearAddBack(pendingAddBacks, target.debtId);
          expect(result).not.toBeNull();

          // Every entry in the result should exist in the original (excluding the removed one)
          const remaining = pendingAddBacks.filter((_, i) => i !== 0);
          expect(result).toEqual(remaining);
        },
      ),
    );
  });
});

// ── Property 5: redeemAddBack/clearAddBack return null for unknown debtId ──
// Feature: grog-shot-delivery-flow, Property 5
// Validates: Requirements 5.5, 6.3

describe('Feature: grog-shot-delivery-flow, Property 5 — redeemAddBack/clearAddBack return null for unknown debtId', () => {
  const addLiquorInputArb = fc.record<AddLiquorInput>({
    category: arbCategory,
    brand: arbBrand,
  });

  it('applyRedeemAddBack returns null when debtId is not in pendingAddBacks', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb),
        fc.uuid(), // unknownDebtId
        addLiquorInputArb,
        fc.uuid(), // actorPlayerId
        fc.constant('2025-06-01T12:00:00.000Z'), // now
        fc.uuid(), // newEntryId
        fc.uuid(), // eventId
        (entries, history, pendingAddBacks, unknownDebtId, input, actorPlayerId, now, newEntryId, eventId) => {
          // Ensure the generated debtId is not present in pendingAddBacks
          fc.pre(!pendingAddBacks.some(p => p.debtId === unknownDebtId));

          const result = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            unknownDebtId, input, actorPlayerId, now, newEntryId, eventId,
          );

          expect(result).toBeNull();
        },
      ),
    );
  });

  it('applyClearAddBack returns null when debtId is not in pendingAddBacks', () => {
    fc.assert(
      fc.property(
        fc.array(pendingAddBackArb),
        fc.uuid(), // unknownDebtId
        (pendingAddBacks, unknownDebtId) => {
          // Ensure the generated debtId is not present in pendingAddBacks
          fc.pre(!pendingAddBacks.some(p => p.debtId === unknownDebtId));

          const result = applyClearAddBack(pendingAddBacks, unknownDebtId);

          expect(result).toBeNull();
        },
      ),
    );
  });
});

// ── Property 8: adminAddBack produces same state transition as redeemAddBack ──
// Feature: grog-shot-delivery-flow, Property 8
// Validates: Requirements 4.6
//
// adminAddBack reuses applyRedeemAddBack — the only difference is authorization
// (admin vs debtor caller). The grog state transition must be identical:
//   - same entries result
//   - same pendingAddBacks result
//   - same history shape (type, sourceDebtId, amountMl, brand, category, eventId, occurredAt)
//   - actorPlayerId differs by design (it records who performed the action)

describe('Feature: grog-shot-delivery-flow, Property 8 — adminAddBack produces same state transition as redeemAddBack', () => {
  const addLiquorInputArb = fc.record<AddLiquorInput>({
    category: arbCategory,
    brand: arbBrand,
  });

  it('entries and pendingAddBacks are identical regardless of caller identity', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb, { minLength: 1 }),
        addLiquorInputArb,
        fc.uuid(), // debtorPlayerId
        fc.uuid(), // adminPlayerId
        fc.constant('2025-06-01T12:00:00.000Z'),
        fc.uuid(), // newEntryId
        fc.uuid(), // eventId
        (entries, history, pendingAddBacks, input, debtorPlayerId, adminPlayerId, now, newEntryId, eventId) => {
          const target = pendingAddBacks[0];

          const debtorResult = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, debtorPlayerId, now, newEntryId, eventId,
          );
          const adminResult = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, adminPlayerId, now, newEntryId, eventId,
          );

          expect(debtorResult).not.toBeNull();
          expect(adminResult).not.toBeNull();

          const [debtorEntries, , debtorPending] = debtorResult!;
          const [adminEntries, , adminPending] = adminResult!;

          expect(adminEntries).toEqual(debtorEntries);
          expect(adminPending).toEqual(debtorPending);
        },
      ),
    );
  });

  it('appended history event has the same shape (type, sourceDebtId, amountMl, brand, category) regardless of caller', () => {
    fc.assert(
      fc.property(
        fc.array(grogEntryArb),
        fc.array(grogHistoryEventArb),
        fc.array(pendingAddBackArb, { minLength: 1 }),
        addLiquorInputArb,
        fc.uuid(), // debtorPlayerId
        fc.uuid(), // adminPlayerId
        fc.constant('2025-06-01T12:00:00.000Z'),
        fc.uuid(), // newEntryId
        fc.uuid(), // eventId
        (entries, history, pendingAddBacks, input, debtorPlayerId, adminPlayerId, now, newEntryId, eventId) => {
          const target = pendingAddBacks[0];

          const debtorResult = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, debtorPlayerId, now, newEntryId, eventId,
          );
          const adminResult = applyRedeemAddBack(
            entries, history, pendingAddBacks,
            target.debtId, input, adminPlayerId, now, newEntryId, eventId,
          );

          expect(debtorResult).not.toBeNull();
          expect(adminResult).not.toBeNull();

          const [, debtorHistory] = debtorResult!;
          const [, adminHistory] = adminResult!;

          expect(adminHistory.length).toBe(debtorHistory.length);

          const debtorEvent = debtorHistory[debtorHistory.length - 1];
          const adminEvent = adminHistory[adminHistory.length - 1];

          // State-transition shape must match — only actorPlayerId differs by design
          expect(adminEvent.type).toBe(debtorEvent.type);
          expect(adminEvent.sourceDebtId).toBe(debtorEvent.sourceDebtId);
          expect(adminEvent.amountMl).toBe(debtorEvent.amountMl);
          expect(adminEvent.brand).toBe(debtorEvent.brand);
          expect(adminEvent.category).toBe(debtorEvent.category);
          expect(adminEvent.occurredAt).toBe(debtorEvent.occurredAt);
          expect(adminEvent.eventId).toBe(debtorEvent.eventId);
        },
      ),
    );
  });
});

// ── Property 6: My Slate outstanding section contains exactly the right grog obligations ──
// Feature: grog-shot-delivery-flow, Property 6
// Validates: Requirements 1.3, 3.5, 7.1, 7.3, 7.5

/**
 * Pure function extracted from MySlateScreen filtering logic.
 * Returns the two sets of grog obligations for a given player:
 *   - takeYourShot: debts with status='resolved', debtPunishment='infinity_grog', debtorId=currentPlayerId
 *   - addBackToGrog: pendingAddBacks entries with debtorId=currentPlayerId
 */
import type { PlayerDebtIndex, PendingAddBack as AppPendingAddBack } from '../types';

function getGrogObligations(
  debts: PlayerDebtIndex[],
  pendingAddBacks: AppPendingAddBack[],
  currentPlayerId: string,
): { takeYourShot: PlayerDebtIndex[]; addBackToGrog: AppPendingAddBack[] } {
  const takeYourShot = debts.filter(
    (d) =>
      d.status === 'resolved' &&
      d.debtPunishment === 'infinity_grog' &&
      d.debtorId === currentPlayerId,
  );
  const addBackToGrog = pendingAddBacks.filter(
    (p) => p.debtorId === currentPlayerId,
  );
  return { takeYourShot, addBackToGrog };
}

// Arbitraries for PlayerDebtIndex
const arbDebtStatus = fc.constantFrom(
  'pending' as const,
  'pending_confirmation' as const,
  'resolved' as const,
  'delivered' as const,
);
const arbPunishmentType = fc.option(
  fc.constantFrom('slap' as const, 'infinity_grog' as const),
  { nil: null },
);
const arbRole = fc.constantFrom('challenger' as const, 'statementMaker' as const);
const arbGameType = fc.constantFrom('manchester' as const, 'read_in' as const);

const playerDebtIndexArb = (currentPlayerId: string) =>
  fc.record<PlayerDebtIndex>({
    debtId: fc.uuid(),
    groupId: fc.uuid(),
    playerId: fc.uuid(),
    role: arbRole,
    status: arbDebtStatus,
    gameType: arbGameType,
    statement: fc.string({ minLength: 1, maxLength: 50 }),
    challengerId: fc.uuid(),
    statementMakerId: fc.uuid(),
    // debtorId is either the currentPlayerId or some other player
    debtorId: fc.oneof(fc.constant(currentPlayerId), fc.uuid(), fc.constant(null)),
    creditorId: fc.option(fc.uuid(), { nil: null }),
    debtPunishment: arbPunishmentType,
    createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
  });

const appPendingAddBackArb = (currentPlayerId: string) =>
  fc.record<AppPendingAddBack>({
    debtId: fc.uuid(),
    // debtorId is either the currentPlayerId or some other player
    debtorId: fc.oneof(fc.constant(currentPlayerId), fc.uuid()),
    createdAt: fc.constant('2025-01-01T00:00:00.000Z'),
  });

describe('Feature: grog-shot-delivery-flow, Property 6 — My Slate outstanding section contains exactly the right grog obligations', () => {
  it('takeYourShot contains exactly debts with status=resolved, debtPunishment=infinity_grog, debtorId=currentPlayerId', () => {
    fc.assert(
      fc.property(
        fc.uuid().chain((currentPlayerId) =>
          fc.tuple(
            fc.array(playerDebtIndexArb(currentPlayerId), { maxLength: 20 }),
            fc.array(appPendingAddBackArb(currentPlayerId), { maxLength: 10 }),
            fc.constant(currentPlayerId),
          ),
        ),
        ([debts, pendingAddBacks, currentPlayerId]) => {
          const { takeYourShot } = getGrogObligations(debts, pendingAddBacks, currentPlayerId);

          // Every item in takeYourShot must satisfy all three conditions
          for (const d of takeYourShot) {
            expect(d.status).toBe('resolved');
            expect(d.debtPunishment).toBe('infinity_grog');
            expect(d.debtorId).toBe(currentPlayerId);
          }

          // Every debt satisfying all three conditions must appear in takeYourShot
          const expected = debts.filter(
            (d) =>
              d.status === 'resolved' &&
              d.debtPunishment === 'infinity_grog' &&
              d.debtorId === currentPlayerId,
          );
          expect(takeYourShot.length).toBe(expected.length);
        },
      ),
    );
  });

  it('addBackToGrog contains exactly pendingAddBacks entries with debtorId=currentPlayerId', () => {
    fc.assert(
      fc.property(
        fc.uuid().chain((currentPlayerId) =>
          fc.tuple(
            fc.array(playerDebtIndexArb(currentPlayerId), { maxLength: 20 }),
            fc.array(appPendingAddBackArb(currentPlayerId), { maxLength: 10 }),
            fc.constant(currentPlayerId),
          ),
        ),
        ([debts, pendingAddBacks, currentPlayerId]) => {
          const { addBackToGrog } = getGrogObligations(debts, pendingAddBacks, currentPlayerId);

          // Every item in addBackToGrog must belong to the current player
          for (const p of addBackToGrog) {
            expect(p.debtorId).toBe(currentPlayerId);
          }

          // Every pendingAddBack for the current player must appear
          const expected = pendingAddBacks.filter((p) => p.debtorId === currentPlayerId);
          expect(addBackToGrog.length).toBe(expected.length);
        },
      ),
    );
  });

  it('no other player obligations appear — only currentPlayerId obligations are included', () => {
    fc.assert(
      fc.property(
        fc.uuid().chain((currentPlayerId) =>
          fc.tuple(
            fc.array(playerDebtIndexArb(currentPlayerId), { maxLength: 20 }),
            fc.array(appPendingAddBackArb(currentPlayerId), { maxLength: 10 }),
            fc.constant(currentPlayerId),
          ),
        ),
        ([debts, pendingAddBacks, currentPlayerId]) => {
          const { takeYourShot, addBackToGrog } = getGrogObligations(debts, pendingAddBacks, currentPlayerId);

          // No takeYourShot card for a different player's debt
          for (const d of takeYourShot) {
            expect(d.debtorId).toBe(currentPlayerId);
          }

          // No addBackToGrog card for a different player's pending add-back
          for (const p of addBackToGrog) {
            expect(p.debtorId).toBe(currentPlayerId);
          }
        },
      ),
    );
  });

  it('debts with status!=resolved or debtPunishment!=infinity_grog are excluded from takeYourShot', () => {
    fc.assert(
      fc.property(
        fc.uuid().chain((currentPlayerId) =>
          fc.tuple(
            fc.array(playerDebtIndexArb(currentPlayerId), { maxLength: 20 }),
            fc.constant(currentPlayerId),
          ),
        ),
        ([debts, currentPlayerId]) => {
          const { takeYourShot } = getGrogObligations(debts, [], currentPlayerId);

          // None of the excluded debts should appear
          const excluded = debts.filter(
            (d) =>
              d.status !== 'resolved' ||
              d.debtPunishment !== 'infinity_grog' ||
              d.debtorId !== currentPlayerId,
          );
          for (const d of excluded) {
            expect(takeYourShot.some((t) => t.debtId === d.debtId)).toBe(false);
          }
        },
      ),
    );
  });
});

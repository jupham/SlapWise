import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  SHOT_ML,
  applyAddLiquor,
  applyRemoveLiquor,
  applyProportionalRemoval,
  applyConfirmDelivery,
  validateSeedEntries,
  buildInitialGrog,
  type GrogEntry,
  type AddLiquorInput,
} from '../../../infrastructure/lambda/grog-resolver/logic';
import type { Grog, GrogHistoryEvent } from '../types';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  'vodka', 'whiskey', 'bourbon', 'scotch', 'irish_whiskey',
  'canadian_whiskey', 'rum', 'gin', 'tequila', 'brandy', 'other',
] as const;

const arbCategory = fc.constantFrom(...CATEGORIES);

const arbBrand = fc.string({ minLength: 1, maxLength: 30 }).filter(s => s.trim().length > 0);

const arbEntry = fc.record<GrogEntry>({
  entryId: fc.uuid(),
  category: arbCategory,
  brand: arbBrand,
  amountMl: fc.float({ min: Math.fround(0.02), max: Math.fround(5000), noNaN: true }),
});

/** A list of entries with unique entryIds */
const arbEntries = fc
  .array(arbEntry, { minLength: 0, maxLength: 20 })
  .map(entries => {
    const seen = new Set<string>();
    return entries.filter(e => {
      if (seen.has(e.entryId)) return false;
      seen.add(e.entryId);
      return true;
    });
  });

const arbNonEmptyEntries = arbEntries.filter(es => es.length > 0);

const arbAddLiquorInput = fc.record<AddLiquorInput>({
  category: arbCategory,
  brand: arbBrand,
});

// ── Property 2: addLiquor merges duplicate brands, history grows by 1 ─────────

describe('Property 2: addLiquor merges duplicate brands, history grows by 1', () => {
  it('appends a new entry when brand+category is absent', () => {
    fc.assert(
      fc.property(arbEntries, arbAddLiquorInput, fc.uuid(), (entries, input, newId) => {
        // Ensure no existing entry matches brand+category
        const filtered = entries.filter(
          e => !(e.brand === input.brand && e.category === input.category),
        );
        const result = applyAddLiquor(filtered, input, newId);

        expect(result.length).toBe(filtered.length + 1);
        const added = result.find(e => e.entryId === newId);
        expect(added).toBeDefined();
        expect(added!.amountMl).toBeCloseTo(SHOT_ML);
        expect(added!.brand).toBe(input.brand);
        expect(added!.category).toBe(input.category);
      }),
    );
  });

  it('merges into existing entry when brand+category matches', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, fc.uuid(), (entries, newId) => {
        // Pick an existing entry to duplicate
        const target = entries[0];
        const input: AddLiquorInput = { brand: target.brand, category: target.category };
        const before = target.amountMl;

        const result = applyAddLiquor(entries, input, newId);

        expect(result.length).toBe(entries.length); // no new entry
        const merged = result.find(
          e => e.brand === target.brand && e.category === target.category,
        );
        expect(merged).toBeDefined();
        expect(merged!.amountMl).toBeCloseTo(before + SHOT_ML);
      }),
    );
  });

  it('does not mutate the original entries array', () => {
    fc.assert(
      fc.property(arbEntries, arbAddLiquorInput, fc.uuid(), (entries, input, newId) => {
        const snapshot = entries.map(e => ({ ...e }));
        applyAddLiquor(entries, input, newId);
        expect(entries).toEqual(snapshot);
      }),
    );
  });
});

// ── Property 3: removeLiquor shrinks entries, history unchanged ───────────────

describe('Property 3: removeLiquor shrinks entries, history unchanged', () => {
  it('removes exactly the targeted entry', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, (entries) => {
        const target = entries[Math.floor(entries.length / 2)];
        const result = applyRemoveLiquor(entries, target.entryId);

        expect(result).not.toBeNull();
        expect(result!.length).toBe(entries.length - 1);
        expect(result!.find(e => e.entryId === target.entryId)).toBeUndefined();
      }),
    );
  });

  it('returns null for a non-existent entryId', () => {
    fc.assert(
      fc.property(arbEntries, fc.uuid(), (entries, missingId) => {
        // Ensure missingId is not in entries
        fc.pre(!entries.some(e => e.entryId === missingId));
        const result = applyRemoveLiquor(entries, missingId);
        expect(result).toBeNull();
      }),
    );
  });

  it('does not mutate the original entries array', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, (entries) => {
        const target = entries[0];
        const snapshot = entries.map(e => ({ ...e }));
        applyRemoveLiquor(entries, target.entryId);
        expect(entries).toEqual(snapshot);
      }),
    );
  });
});

// ── Property 5: Shot delivery reduces all entry amounts proportionally ────────

describe('Property 5: Shot delivery reduces all entry amounts proportionally', () => {
  it('total volume decreases by SHOT_ML (or reaches 0)', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, (entries) => {
        const totalBefore = entries.reduce((s, e) => s + e.amountMl, 0);
        const result = applyProportionalRemoval(entries);
        const totalAfter = result.reduce((s, e) => s + e.amountMl, 0);

        if (totalBefore <= SHOT_ML) {
          // All entries may be wiped — result is 0 or near-zero survivors above 0.01 threshold
          expect(totalAfter).toBeGreaterThanOrEqual(0);
          expect(totalAfter).toBeLessThan(SHOT_ML);
        } else {
          // Allow 1% relative tolerance for floating-point accumulation across many entries
          const expected = totalBefore - SHOT_ML;
          expect(Math.abs(totalAfter - expected) / expected).toBeLessThan(0.01);
        }
      }),
    );
  });

  it('each remaining entry is reduced proportionally', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, (entries) => {
        const total = entries.reduce((s, e) => s + e.amountMl, 0);
        fc.pre(total > SHOT_ML); // ensure entries survive removal
        const result = applyProportionalRemoval(entries);

        for (const original of entries) {
          const after = result.find(e => e.entryId === original.entryId);
          if (after) {
            const expected = original.amountMl - SHOT_ML * (original.amountMl / total);
            expect(after.amountMl).toBeCloseTo(expected, 4);
          }
        }
      }),
    );
  });

  it('entries at or below 0.01 mL are removed', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, (entries) => {
        const result = applyProportionalRemoval(entries);
        for (const e of result) {
          expect(e.amountMl).toBeGreaterThan(0.01);
        }
      }),
    );
  });

  it('returns a copy — does not mutate original entries', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, (entries) => {
        const snapshot = entries.map(e => ({ ...e }));
        applyProportionalRemoval(entries);
        expect(entries).toEqual(snapshot);
      }),
    );
  });
});

// ── Property 6: Shot delivery appends exactly one shot_taken history event ────

describe('Property 6: Shot delivery appends exactly one shot_taken history event', () => {
  it('history grows by exactly 1 with type shot_taken', () => {
    fc.assert(
      fc.property(
        arbEntries,
        fc.array(fc.record({
          eventId: fc.uuid(),
          type: fc.constantFrom('addition', 'shot_taken'),
          actorPlayerId: fc.uuid(),
          occurredAt: fc.constant('2025-01-01T00:00:00.000Z'),
          sourceDebtId: fc.option(fc.uuid(), { nil: null }),
          brand: fc.option(arbBrand, { nil: null }),
          category: fc.option(arbCategory, { nil: null }),
        amountMl: fc.option(fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }), { nil: null }),
        })),
        fc.uuid(), // actorPlayerId
        fc.uuid(), // debtId
        fc.uuid(), // shotEventId
        (entries, history, actor, debtId, shotEventId) => {
          const [, newHistory] = applyConfirmDelivery(
            entries, history, actor, debtId,
            '2025-06-01T12:00:00.000Z', shotEventId,
          );

          expect(newHistory.length).toBe(history.length + 1);
          const shotEvent = newHistory[newHistory.length - 1];
          expect(shotEvent.type).toBe('shot_taken');
          expect(shotEvent.actorPlayerId).toBe(actor);
          expect(shotEvent.sourceDebtId).toBe(debtId);
          expect(shotEvent.amountMl).toBeCloseTo(SHOT_ML);
          expect(shotEvent.brand).toBeNull();
          expect(shotEvent.category).toBeNull();
        },
      ),
    );
  });
});

// ── Property 7: Shot delivery with add-back records both events; duplicate brand merges ──

describe('Property 7: Shot delivery with add-back records both events; duplicate brand merges', () => {
  it('history grows by 2: shot_taken then addition', () => {
    fc.assert(
      fc.property(
        arbEntries,
        arbAddLiquorInput,
        fc.uuid(), fc.uuid(), fc.uuid(), fc.uuid(),
        (entries, addBack, actor, debtId, shotId, addBackEventId) => {
          const [, newHistory] = applyConfirmDelivery(
            entries, [], actor, debtId,
            '2025-06-01T12:00:00.000Z', shotId,
            addBack, 'new-entry-id', addBackEventId,
          );

          expect(newHistory.length).toBe(2);
          expect(newHistory[0].type).toBe('shot_taken');
          expect(newHistory[1].type).toBe('addition');
          expect(newHistory[1].brand).toBe(addBack.brand);
          expect(newHistory[1].category).toBe(addBack.category);
          expect(newHistory[1].sourceDebtId).toBe(debtId);
          expect(newHistory[1].amountMl).toBeCloseTo(SHOT_ML);
        },
      ),
    );
  });

  it('add-back merges into existing entry when brand+category matches', () => {
    fc.assert(
      fc.property(arbNonEmptyEntries, fc.uuid(), fc.uuid(), fc.uuid(), (entries, actor, debtId, shotId) => {
        const target = entries[0];
        const addBack: AddLiquorInput = { brand: target.brand, category: target.category };
        const beforeAmount = target.amountMl;
        const total = entries.reduce((s, e) => s + e.amountMl, 0);

        const [newEntries] = applyConfirmDelivery(
          entries, [], actor, debtId,
          '2025-06-01T12:00:00.000Z', shotId,
          addBack, 'unused-id', 'evt-id',
        );

        const merged = newEntries.find(
          e => e.brand === target.brand && e.category === target.category,
        );
        expect(merged).toBeDefined();

        // After proportional removal the entry's amount is reduced, then SHOT_ML is added back
        const expectedAfterRemoval = beforeAmount - SHOT_ML * (beforeAmount / total);
        if (expectedAfterRemoval > 0.01) {
          expect(merged!.amountMl).toBeCloseTo(expectedAfterRemoval + SHOT_ML, 3);
        } else {
          // Entry was wiped by removal, re-created with SHOT_ML
          expect(merged!.amountMl).toBeCloseTo(SHOT_ML, 3);
        }
      }),
    );
  });

  it('add-back creates a new entry when brand+category is absent', () => {
    fc.assert(
      fc.property(arbEntries, arbAddLiquorInput, fc.uuid(), fc.uuid(), fc.uuid(), fc.uuid(),
        (entries, addBack, actor, debtId, shotId, newEntryId) => {
          const filtered = entries.filter(
            e => !(e.brand === addBack.brand && e.category === addBack.category),
          );
          const [newEntries] = applyConfirmDelivery(
            filtered, [], actor, debtId,
            '2025-06-01T12:00:00.000Z', shotId,
            addBack, newEntryId, 'evt-id',
          );

          const added = newEntries.find(
            e => e.brand === addBack.brand && e.category === addBack.category,
          );
          expect(added).toBeDefined();
          expect(added!.amountMl).toBeCloseTo(SHOT_ML, 3);
        },
      ),
    );
  });
});

// ── Property 13: initializeGrog with seedEntries: entries+history match ───────

describe('Property 13: initializeGrog with seedEntries: entries+history match', () => {
  it('produces one entry and one addition event per seed entry', () => {
    fc.assert(
      fc.property(
        fc.array(arbAddLiquorInput, { minLength: 0, maxLength: 20 }),
        fc.uuid(),
        (seeds, actor) => {
          const ids = seeds.map(() => ({ entryId: fc.sample(fc.uuid(), 1)[0], eventId: fc.sample(fc.uuid(), 1)[0] }));
          const { entries, history } = buildInitialGrog(seeds, actor, '2025-01-01T00:00:00.000Z', ids);

          expect(entries.length).toBe(seeds.length);
          expect(history.length).toBe(seeds.length);

          for (let i = 0; i < seeds.length; i++) {
            expect(entries[i].brand).toBe(seeds[i].brand);
            expect(entries[i].category).toBe(seeds[i].category);
            expect(entries[i].amountMl).toBeCloseTo(SHOT_ML);
            expect(history[i].type).toBe('addition');
            expect(history[i].brand).toBe(seeds[i].brand);
            expect(history[i].category).toBe(seeds[i].category);
            expect(history[i].amountMl).toBeCloseTo(SHOT_ML);
            expect(history[i].actorPlayerId).toBe(actor);
            expect(history[i].sourceDebtId).toBeNull();
          }
        },
      ),
    );
  });
});

// ── Property 14: initializeGrog overflow returns error ───────────────────────

describe('Property 14: initializeGrog overflow returns error', () => {
  it('rejects when seedEntries volume exceeds bottleSize', () => {
    fc.assert(
      fc.property(
        fc.array(arbAddLiquorInput, { minLength: 1, maxLength: 50 }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(5000), noNaN: true }),
        (seeds, bottleSize) => {
          // Force overflow: require more seeds than the bottle can hold
          const overflowCount = Math.floor(bottleSize / SHOT_ML) + 1;
          const overflowSeeds = Array.from({ length: overflowCount }, (_, i) => seeds[i % seeds.length]);

          expect(validateSeedEntries(overflowSeeds, bottleSize)).toBe(false);
        },
      ),
    );
  });

  it('accepts when seedEntries volume fits within bottleSize', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 20 }),
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
        (count, bottleSize) => {
          // Only use as many seeds as fit
          const maxSeeds = Math.floor(bottleSize / SHOT_ML);
          const seedCount = Math.min(count, maxSeeds);
          const seeds = Array.from({ length: seedCount }, () => ({ brand: 'Test', category: 'vodka' }));

          expect(validateSeedEntries(seeds, bottleSize)).toBe(true);
        },
      ),
    );
  });
});

// ── Property 1: Grog data model completeness ─────────────────────────────────

describe('Property 1: Grog data model completeness', () => {
  // Arbitraries for a well-formed Grog matching the TypeScript interfaces

  const arbHistoryEvent = fc.record<GrogHistoryEvent>({
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

  const arbGrog = fc.record({
    groupId: fc.uuid(),
    bottleSize: fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
    entries: arbEntries as fc.Arbitrary<import('../types').GrogEntry[]>,
    history: fc.array(arbHistoryEvent, { minLength: 0, maxLength: 20 }),
  }) as fc.Arbitrary<Grog>;

  it('every Grog has groupId, bottleSize, entries, and history', () => {
    fc.assert(
      fc.property(arbGrog, (grog) => {
        expect(typeof grog.groupId).toBe('string');
        expect(grog.groupId!.length).toBeGreaterThan(0);
        expect(typeof grog.bottleSize).toBe('number');
        expect(grog.bottleSize).toBeGreaterThan(0);
        expect(Array.isArray(grog.entries)).toBe(true);
        expect(Array.isArray(grog.history)).toBe(true);
      }),
    );
  });

  it('every GrogEntry has entryId, category, brand, and amountMl', () => {
    fc.assert(
      fc.property(arbGrog, (grog) => {
        for (const entry of grog.entries!) {
          expect(typeof entry.entryId).toBe('string');
          expect(entry.entryId.length).toBeGreaterThan(0);
          expect(typeof entry.category).toBe('string');
          expect(typeof entry.brand).toBe('string');
          expect(entry.brand.trim().length).toBeGreaterThan(0);
          expect(typeof entry.amountMl).toBe('number');
          expect(entry.amountMl).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('every GrogHistoryEvent has eventId, type, actorPlayerId, and occurredAt', () => {
    fc.assert(
      fc.property(arbGrog, (grog) => {
        for (const event of grog.history!) {
          expect(typeof event.eventId).toBe('string');
          expect(event.eventId.length).toBeGreaterThan(0);
          expect(['addition', 'shot_taken']).toContain(event.type);
          expect(typeof event.actorPlayerId).toBe('string');
          expect(event.actorPlayerId.length).toBeGreaterThan(0);
          expect(typeof event.occurredAt).toBe('string');
          expect(event.occurredAt.length).toBeGreaterThan(0);
        }
      }),
    );
  });

  it('buildInitialGrog output satisfies the Grog data model', () => {
    fc.assert(
      fc.property(
        fc.array(arbAddLiquorInput, { minLength: 0, maxLength: 10 }),
        fc.uuid(),
        fc.float({ min: Math.fround(1), max: Math.fround(5000), noNaN: true }),
        (seeds, actor, bottleSize) => {
          const maxSeeds = Math.floor(bottleSize / SHOT_ML);
          const validSeeds = seeds.slice(0, maxSeeds);
          const ids = validSeeds.map(() => ({
            entryId: fc.sample(fc.uuid(), 1)[0],
            eventId: fc.sample(fc.uuid(), 1)[0],
          }));
          const { entries, history } = buildInitialGrog(
            validSeeds, actor, '2025-01-01T00:00:00.000Z', ids,
          );

          // entries shape
          for (const entry of entries) {
            expect(typeof entry.entryId).toBe('string');
            expect(typeof entry.category).toBe('string');
            expect(typeof entry.brand).toBe('string');
            expect(typeof entry.amountMl).toBe('number');
          }

          // history shape
          for (const event of history) {
            expect(typeof event.eventId).toBe('string');
            expect(['addition', 'shot_taken']).toContain(event.type);
            expect(typeof event.actorPlayerId).toBe('string');
            expect(typeof event.occurredAt).toBe('string');
          }
        },
      ),
    );
  });
});

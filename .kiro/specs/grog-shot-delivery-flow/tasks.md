# Implementation Plan: Grog Shot Delivery Flow

## Overview

Implement the redesigned Infinity Grog shot delivery workflow: new pure logic functions in `logic.ts`, four new Lambda handlers, GraphQL schema extensions, TypeScript type updates, GrogService additions, Sentence Screen two-phase flow, My Slate grog obligations, and Grog Review Screen manage mode.

## Tasks

- [ ] 1. Extend TypeScript types and GraphQL schema
  - [x] 1.1 Add `PendingAddBack` interface and update `Grog` interface in `app/src/types/index.ts`
    - Export `PendingAddBack` with fields `debtId: string`, `debtorId: string`, `createdAt: string`
    - Add `pendingAddBacks: PendingAddBack[]` field to the `Grog` interface
    - `GrogHistoryEventType` remains unchanged
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 1.2 Extend GraphQL schema in `infrastructure/lib/graphql/schema.graphql`
    - Add `PendingAddBack` type with fields `debtId: ID!`, `debtorId: ID!`, `createdAt: AWSDateTime!`
    - Add `pendingAddBacks: [PendingAddBack!]!` field to the `Grog` type
    - Add mutations: `takeGrogShot`, `redeemAddBack`, `clearAddBack`, `adminAddBack`
    - Retain `confirmGrogDelivery` unchanged
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [x] 2. Implement pure logic functions in `infrastructure/lambda/grog-resolver/logic.ts`
  - [x] 2.1 Add `PendingAddBack` interface and implement `applyTakeGrogShot`
    - Export `PendingAddBack` interface with `debtId`, `debtorId`, `createdAt`
    - Implement `applyTakeGrogShot(entries, history, pendingAddBacks, debtorId, debtId, now, shotEventId)` returning `[GrogEntry[], GrogHistoryEvent[], PendingAddBack[]]`
    - Reuse `applyProportionalRemoval` for entries; append `shot_taken` event; append new `PendingAddBack`
    - _Requirements: 2.1, 2.2, 2.5, 4.2, 4.3_

  - [x] 2.2 Write property test for `applyTakeGrogShot` — Property 1
    - **Property 1: takeGrogShot applies proportional removal and appends shot_taken event**
    - **Validates: Requirements 2.1, 2.2**
    - File: `app/src/tests/grog-shot-delivery-flow.test.ts`
    - Use `fc.array(grogEntryArb, { minLength: 1 })` for non-empty entries

  - [x] 2.3 Write property test for `applyTakeGrogShot` — Property 2
    - **Property 2: takeGrogShot appends exactly one PendingAddBack with correct fields**
    - **Validates: Requirements 2.5, 4.2, 4.3**

  - [x] 2.4 Write property test for `applyTakeGrogShot` — Property 7
    - **Property 7: PendingAddBack fields are all present and non-empty**
    - **Validates: Requirements 4.2, 9.1**

  - [x] 2.5 Implement `applyRedeemAddBack`
    - Implement `applyRedeemAddBack(entries, history, pendingAddBacks, debtId, input, actorPlayerId, now, newEntryId, eventId)` returning `[GrogEntry[], GrogHistoryEvent[], PendingAddBack[]] | null`
    - Reuse `applyAddLiquor` for merge logic; append `addition` event with `sourceDebtId`; remove matching `pendingAddBacks` entry by `debtId`
    - Return `null` if `debtId` not found in `pendingAddBacks`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 4.4_

  - [x] 2.6 Write property test for `applyRedeemAddBack` — Property 3
    - **Property 3: redeemAddBack merges entries, appends addition event, removes pending entry**
    - **Validates: Requirements 5.1, 5.2, 5.3, 4.4**

  - [x] 2.7 Implement `applyClearAddBack`
    - Implement `applyClearAddBack(pendingAddBacks, debtId)` returning `PendingAddBack[] | null`
    - Remove matching entry by `debtId`; return `null` if not found; leave entries and history untouched
    - _Requirements: 6.1, 6.3, 4.5_

  - [x] 2.8 Write property test for `applyClearAddBack` — Property 4
    - **Property 4: clearAddBack removes pending entry, entries and history unchanged**
    - **Validates: Requirements 6.1, 4.5**

  - [x] 2.9 Write property test for `applyRedeemAddBack` and `applyClearAddBack` — Property 5
    - **Property 5: redeemAddBack/clearAddBack return null for unknown debtId**
    - **Validates: Requirements 5.5, 6.3**

  - [x] 2.10 Write property test for `applyRedeemAddBack` (adminAddBack equivalence) — Property 8
    - **Property 8: adminAddBack produces same state transition as redeemAddBack**
    - **Validates: Requirements 4.6**

- [x] 3. Checkpoint — Ensure all logic tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend `grog-resolver` Lambda with new handlers
  - [x] 4.1 Add marshal/unmarshal helpers for `PendingAddBack` in `infrastructure/lambda/grog-resolver/index.ts`
    - Add `unmarshalPendingAddBack`, `marshalPendingAddBack` functions
    - Update `marshalGrog` / `fetchGrog` to read and return `pendingAddBacks` list
    - Update `writeGrog` or add a dedicated write helper that includes `pendingAddBacks`
    - _Requirements: 4.1, 4.2_

  - [x] 4.2 Implement `takeGrogShot` handler
    - Fetch DEBT item; verify `status === 'resolved'` and `debtPunishment === 'infinity_grog'`; verify `callerId === debtorId`
    - Call `applyTakeGrogShot` for pure state transition
    - Execute `TransactWrite` with four operations: UpdateItem GROG (entries + history + pendingAddBacks), UpdateItem DEBT (status→delivered, deliveredAt), UpdateItem PLAYERDEBT debtor, UpdateItem PLAYERDEBT creditor
    - After successful `TransactWrite`: write `slap_delivered` FEED entry (best-effort `PutItem`), send Pinpoint push notification to group (best-effort)
    - PLAYERDEBT SK constructed as `DEBT#<createdAt>#<debtId>` using `createdAt` from the fetched DEBT item
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [x] 4.3 Implement `redeemAddBack` handler
    - Fetch GROG item; verify caller is debtor for that `debtId` (from `pendingAddBacks` entry) or admin
    - Call `applyRedeemAddBack`; return `PENDING_ADD_BACK_NOT_FOUND` if null
    - Execute single `UpdateItem` on GROG item (entries + history + pendingAddBacks)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.4 Implement `clearAddBack` handler
    - Verify caller is admin; fetch GROG item
    - Call `applyClearAddBack`; return `PENDING_ADD_BACK_NOT_FOUND` if null
    - Execute single `UpdateItem` on GROG item (pendingAddBacks only)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 4.5 Implement `adminAddBack` handler
    - Verify caller is admin; fetch GROG item
    - Reuse `applyRedeemAddBack` for state transition; return `PENDING_ADD_BACK_NOT_FOUND` if null
    - Execute single `UpdateItem` on GROG item (entries + history + pendingAddBacks)
    - _Requirements: 4.6_

  - [x] 4.6 Register new handlers in the dispatcher `switch` in `index.ts`
    - Add cases for `takeGrogShot`, `redeemAddBack`, `clearAddBack`, `adminAddBack`
    - _Requirements: 2.1, 5.1, 6.1, 4.6_

- [x] 5. Checkpoint — Ensure Lambda compiles cleanly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Extend `GrogService` with new methods
  - [x] 6.1 Update `GROG_FIELDS` fragment to include `pendingAddBacks { debtId debtorId createdAt }` in `app/src/services/GrogService.ts`
    - _Requirements: 4.7_

  - [x] 6.2 Add `takeGrogShot`, `redeemAddBack`, `clearAddBack`, and `adminAddBack` GraphQL documents and service methods
    - `takeGrogShot(groupId: string, debtId: string): Promise<Grog>`
    - `redeemAddBack(groupId: string, debtId: string, category: LiquorCategory, brand: string): Promise<Grog>`
    - `clearAddBack(groupId: string, debtId: string): Promise<Grog>`
    - `adminAddBack(groupId: string, debtId: string, category: LiquorCategory, brand: string): Promise<Grog>`
    - _Requirements: 2.10, 5.6, 6.4_

- [x] 7. Update `InfinityGrogSentenceScreen` with two-phase shot flow
  - [x] 7.1 Add "Take Later" button and replace `confirmGrogDelivery` call with `takeGrogShot`
    - Add `shotTaken: boolean` and `showPostShotDialog: boolean` local state
    - Add "Take Later" button that calls `navigation.goBack()` with no mutation
    - Replace `handleTakeTheShot` → `confirmDelivery` flow: tapping "Take the Shot" calls `GrogService.takeGrogShot(groupId, debtId)`
    - On success set `shotTaken = true`, `showPostShotDialog = true`; on error show inline error and re-enable button
    - _Requirements: 1.1, 1.2, 2.1, 2.10_

  - [x] 7.2 Implement post-shot dialog with "Add Back Now" / "Add Back Later" options
    - Render modal overlay when `showPostShotDialog === true`
    - "Add Back Now" hides dialog, shows `AddLiquorSheet`; on submit calls `GrogService.redeemAddBack(...)` then navigates back
    - "Add Back Later" navigates back immediately (PendingAddBack already created)
    - Closing `AddLiquorSheet` without submitting also navigates back (add-back deferred)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [-] 8. Update `MySlateScreen` to surface grog obligations
  - [x] 8.1 Fetch grog data alongside debts and members on mount
    - Add `GrogService.getGrog(groupId)` to the `Promise.all` in `load`
    - Store result in `grog` state; handle null (grog not initialized)
    - _Requirements: 7.1, 7.3_

  - [x] 8.2 Render "Take Your Shot" cards in Outstanding Punishments
    - Debts with `status === 'resolved'`, `debtPunishment === 'infinity_grog'`, `debtorId === currentPlayerId` already navigate to `InfinityGrogSentence` — verify this path is correct and formalize it
    - _Requirements: 1.3, 1.4, 7.1, 7.2_

  - [x] 8.3 Render "Add Back to Grog" cards for pending add-backs
    - For each entry in `grog.pendingAddBacks` where `debtorId === currentPlayerId`, render a separate card in "Outstanding Punishments"
    - Tapping opens `AddLiquorSheet`; on submit calls `GrogService.redeemAddBack(groupId, entry.debtId, category, brand)` and refreshes
    - Show inline error on failure; only show current player's own pending add-backs
    - _Requirements: 3.5, 7.3, 7.4, 7.5_

  - [x] 8.4 Write property test for My Slate outstanding section filtering — Property 6
    - **Property 6: My Slate outstanding section contains exactly the right grog obligations**
    - **Validates: Requirements 1.3, 3.5, 7.1, 7.3, 7.5**
    - Test the filtering logic as a pure function extracted from the component

- [x] 9. Update `InfinityGrogReviewScreen` with Manage Mode
  - [x] 9.1 Add `manageMode` state and "Manage" / "Done" header button for admins
    - Add `manageMode: boolean` state, default `false`
    - When `isAdmin`, call `navigation.setOptions` to add a header button: "Manage" when `manageMode === false`, "Done" when `manageMode === true`
    - When manage mode activates, update header title to "Managing Grog"
    - Non-admin players never see the button; `manageMode` stays false
    - _Requirements: 10.1, 10.2, 10.3, 10.7_

  - [x] 9.2 Gate existing admin controls behind `manageMode`
    - Move all existing admin controls (add liquor button, per-entry remove/adjust, initialize grog button) to render only when `manageMode === true`
    - Default view shows skull + history only, regardless of admin status
    - _Requirements: 10.1, 10.4, 10.6, 10.7_

  - [x] 9.3 Add Pending Add-Backs section in Manage Mode
    - When `manageMode === true` and `grog.pendingAddBacks.length > 0`, render a "Pending Add-Backs" section below the skull (above history)
    - Each row shows debtor username (resolved from `memberMap`) + formatted `createdAt` date
    - "Clear" action calls `GrogService.clearAddBack(groupId, entry.debtId)` and refreshes; show inline error on failure
    - "Add Shot" action opens `AddLiquorSheet`; on submit calls `GrogService.adminAddBack(groupId, entry.debtId, category, brand)` and refreshes; show inline error on failure
    - Section hidden when `pendingAddBacks.length === 0`
    - _Requirements: 10.5, 10.8_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests live in `app/src/tests/grog-shot-delivery-flow.test.ts` and use `fast-check`
- `adminAddBack` reuses `applyRedeemAddBack` — authorization differs, state transition is identical (Property 8)
- `confirmGrogDelivery` is retained in schema and Lambda dispatcher unchanged — no app code calls it in the new flow
- PLAYERDEBT SK format: `DEBT#<createdAt>#<debtId>` — `createdAt` must be read from the DEBT item before the `TransactWrite`
- FEED write and Pinpoint push after `takeGrogShot` are best-effort — failures are logged but do not roll back the shot

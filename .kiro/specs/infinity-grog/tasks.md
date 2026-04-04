# Implementation Plan: Infinity Grog

## Overview

Implement the Infinity Grog feature end-to-end: TypeScript types, GraphQL schema extensions, a single `grog-resolver` Lambda, AppSync/CDK wiring, the `GrogService`, constants, two new screens, two bottom sheet modals, and the `GrogSkull` SVG component.

## Tasks

- [x] 1. Add TypeScript types and constants
  - Add `LiquorCategory`, `GrogHistoryEventType`, `GrogEntry`, `GrogHistoryEvent`, and `Grog` to `app/src/types/index.ts`
  - Create `app/src/constants/grog.ts` with `SHOT_ML`, `BOTTLE_SIZE_PRESETS`, `CATEGORY_COLORS`, and `LIQUOR_BRANDS`
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 8.7, 11.2_

- [x] 2. Extend GraphQL schema
  - [x] 2.1 Add grog types and operations to `infrastructure/lib/graphql/schema.graphql`
    - Add `LiquorCategory` enum, `GrogEntry` type, `GrogHistoryEvent` type, `Grog` type, `AddLiquorInput` input
    - Add `getGrog` query and all five grog mutations to the schema
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

- [x] 3. Implement `grog-resolver` Lambda
  - [x] 3.1 Create `infrastructure/lambda/grog-resolver/index.ts` with dispatcher and `initializeGrog` handler
    - Dispatch on `event.info.fieldName`; implement `initializeGrog` with `PutItem` + `attribute_not_exists(PK)` condition, seed entries validation (`seedEntries.length * SHOT_ML <= bottleSize`), and corresponding `addition` history events
    - Fetch GROUP METADATA to verify admin for all admin-only mutations
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 3.2 Implement `addLiquorToGrog` handler in `grog-resolver`
    - Fetch current grog, merge into existing entry with same `brand`+`category` or append new entry with `amountMl = SHOT_ML`, append `addition` history event, write via `UpdateItem`
    - _Requirements: 2.1, 2.3_

  - [x] 3.3 Implement `removeLiquorFromGrog` and `adjustGrogEntry` handlers in `grog-resolver`
    - `removeLiquorFromGrog`: remove entry by `entryId`, no history event; return NOT_FOUND if missing
    - `adjustGrogEntry`: set `amountMl` or remove entry if `amountMl = 0`, no history event; validate `amountMl >= 0`; admin-only
    - _Requirements: 2.2, 2.3, 2.4, 12.1, 12.2, 12.3, 12.4_

  - [x] 3.4 Implement `confirmGrogDelivery` handler in `grog-resolver`
    - Fetch current grog; apply proportional removal (`SHOT_ML * entry.amountMl / totalAmountMl` per entry); remove entries ≤ 0.01 mL; append `shot_taken` history event; if `addBack` provided, merge or create entry + append `addition` history event with `sourceDebtId`; write atomically via single `UpdateItem`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 3.5 Write property tests for `grog-resolver` pure logic functions
    - Extract proportional removal, merge logic, and seed validation into pure functions; test in `app/src/tests/grog.test.ts`
    - **Property 5: Shot delivery reduces all entry amounts proportionally**
    - **Validates: Requirements 3.1, 3.2**
    - **Property 6: Shot delivery appends exactly one shot_taken history event**
    - **Validates: Requirements 3.3**
    - **Property 7: Shot delivery with add-back records both events; duplicate brand merges**
    - **Validates: Requirements 3.4, 3.5**
    - **Property 2: addLiquor merges duplicate brands, history grows by 1**
    - **Validates: Requirements 2.1**
    - **Property 3: removeLiquor shrinks entries, history unchanged**
    - **Validates: Requirements 2.2, 12.3**
    - **Property 13: initializeGrog with seedEntries: entries+history match**
    - **Validates: Requirements 11.1**
    - **Property 14: initializeGrog overflow returns error**
    - **Validates: Requirements 11.3**

- [x] 4. Wire Lambda and AppSync resolvers in CDK
  - [x] 4.1 Add `grogResolverFn` to `LambdaStack` (`infrastructure/lib/stacks/lambda-stack.ts`)
    - Define the Lambda function with `TABLE_NAME` env var and grant `ReadWriteData`
    - _Requirements: 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [x] 4.2 Add AppSync data sources and resolvers to `AppSyncStack` (`infrastructure/lib/stacks/appsync-stack.ts`)
    - Add `getGrog` VTL resolver (direct DynamoDB `GetItem` by `PK = GROG#<groupId>`, `SK = METADATA`; return `{ entries: [], history: [] }` when item not found)
    - Add Lambda data source for `grog-resolver` and wire all five mutations
    - _Requirements: 4.1, 4.2, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement `GrogService`
  - Create `app/src/services/GrogService.ts` with `getGrog`, `initializeGrog`, `addLiquor`, `removeLiquor`, `adjustGrogEntry`, and `confirmGrogDelivery` methods using `generateClient()` + typed cast pattern
  - _Requirements: 4.3, 2.5, 3.6, 11.9, 12.6_

  - [x] 6.1 Write property test for `GrogService` data shape
    - **Property 1: Grog data model completeness**
    - **Validates: Requirements 1.2, 1.3, 1.4**

- [x] 7. Add navigation routes
  - Add `InfinityGrogSentence: { debtId: string; groupId: string; groupName: string }` and `InfinityGrogReview: { groupId: string; groupName: string }` to `RootStackParamList` in `app/src/navigation/types.ts`
  - Register both screens in the navigator in `app/src/App.tsx`
  - _Requirements: 9.1, 9.2_

- [x] 8. Build `GrogSkull` SVG component
  - Create `app/src/screens/components/GrogSkull.tsx` using `react-native-svg`
  - Implement `ClipPath` skull outline, stacked `Rect` liquid layers colored by `CATEGORY_COLORS`, and `AnimatedPath` slosh wave driven by a `useSharedValue` phase via `withRepeat(withTiming(...))`
  - Accept props: `entries: GrogEntry[]`, `bottleSize: number`, `animate: boolean` (controls drop + slosh)
  - Compute `fillLevel = totalAmountMl / bottleSize` (clamped to [0,1]) and per-layer height fractions
  - _Requirements: 6.2, 6.3, 6.4, 6.5, 7.2, 11.8_

  - [ ]* 8.1 Write property test for layer computation
    - **Property 9: Layer computation produces proportional heights summing to fill level**
    - **Validates: Requirements 6.3, 6.5, 11.8**

- [x] 9. Build `AddLiquorSheet` bottom sheet modal
  - Create `app/src/screens/components/AddLiquorSheet.tsx`
  - Brand text input with typeahead filtering against `LIQUOR_BRANDS` (case-insensitive `includes`); selecting a suggestion auto-fills brand + category
  - `LiquorCategory` selector always editable; validate non-empty brand + category before submit
  - Accept `onSubmit(category, brand)` and `onClose` props
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 9.1 Write property tests for typeahead and validation
    - **Property 11: Typeahead filtering returns only matching suggestions**
    - **Validates: Requirements 8.2**
    - **Property 12: Validation rejects empty or whitespace-only brand names**
    - **Validates: Requirements 8.6**

- [x] 10. Build `InitializeGrogSheet` bottom sheet modal
  - Create `app/src/screens/components/InitializeGrogSheet.tsx`
  - Numeric input for `bottleSize` with oz/mL toggle (oz → mL: `oz * 29.5735`); preset buttons for 375, 750, 1000, 1750 mL
  - Optional multi-entry seed liquors list using `AddLiquorSheet` brand typeahead + category selector
  - On submit call `GrogService.initializeGrog`; surface validation errors (overflow, already exists)
  - _Requirements: 11.6, 11.7_

- [x] 11. Build `InfinityGrogReviewScreen`
  - Create `app/src/screens/InfinityGrogReviewScreen.tsx`
  - On mount, fetch grog + group members in parallel via `Promise.all([GrogService.getGrog, GroupService.getGroupMembers])`
  - Render `GrogSkull` (static, `animate={false}`), full history log with player IDs resolved to usernames, and entry list showing category, brand, mL, and oz
  - Admin controls: "Add Liquor" button (opens `AddLiquorSheet`), per-entry remove button (`removeLiquor`), per-entry editable `amountMl` field (`adjustGrogEntry`)
  - Show "Initialize Grog" button when admin and grog is null (opens `InitializeGrogSheet`)
  - Add "View the Grog" entry to `GroupDetail` screen navigating to `InfinityGrogReview`
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 12.5_

  - [ ]* 11.1 Write property test for player ID resolution
    - **Property 10: Player ID resolution uses member map**
    - **Validates: Requirements 6.8, 7.6**

- [x] 12. Build `InfinityGrogSentenceScreen`
  - Create `app/src/screens/InfinityGrogSentenceScreen.tsx`
  - Full-screen dark modal; fetch grog + group members in parallel on mount
  - Render `GrogSkull` with `animate={true}` (skull drop via `withSpring` + continuous slosh)
  - Scrollable: skull visualization above fold, history log below
  - "Take the Shot" button calls `GrogService.confirmGrogDelivery`; if `addBack` flow needed, show `AddLiquorSheet` first
  - On success navigate back to My Slate or Group Feed per `9.4`
  - Resolve all player IDs to usernames before rendering history
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.3, 9.4_

- [x] 13. Wire `InfinityGrogSentence` navigation trigger
  - In the delivery confirmation flow (wherever `confirmDelivery` resolves a debt with `debtPunishment = infinity_grog` and the current player is the debtor), navigate to `InfinityGrogSentence` instead of the default post-delivery screen
  - _Requirements: 9.3_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- `SHOT_ML = 44.36` (1.5 US fl oz) is the single source of truth for all shot calculations
- The `grog-resolver` Lambda handles all five mutations; `getGrog` is a direct VTL resolver
- Authorization for admin mutations is enforced inside the Lambda by reading GROUP METADATA
- All caught errors must be logged with `console.error('[ScreenName] context:', err)` before user-facing handling
- Never display raw player IDs — always resolve via the member map with fallback `username ?? playerId`

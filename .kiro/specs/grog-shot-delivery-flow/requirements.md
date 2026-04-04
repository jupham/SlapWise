# Requirements Document

## Introduction

This feature redesigns the Infinity Grog shot delivery workflow in SlapWise. The current flow immediately calls `confirmGrogDelivery` when the user taps "Take the Shot", which is irreversible and forces the add-back decision at the same moment. Real-world scenarios require more flexibility: a user may see the Sentence Screen but not be physically near the bottle, and the add-back decision may need to happen separately from the shot itself.

The redesign introduces three key changes:
1. A deferred/pending state for shot delivery — the user can dismiss the Sentence Screen and return to it later from My Slate.
2. A new `takeGrogShot` mutation that records the shot and marks the debt as delivered, separate from the add-back action.
3. A persistent pending add-back record tracked in DynamoDB, redeemable by the debtor or an admin from My Slate at any time.

## Glossary

- **Sentence_Screen**: The full-screen dramatic reveal shown when a debt resolves with an `infinity_grog` punishment, or when the user taps an outstanding grog punishment on My Slate.
- **Pending_Add_Back**: A record indicating that a debtor is entitled to add one liquor back to the grog following a shot they have taken. Persists in DynamoDB until redeemed or cleared by an admin.
- **takeGrogShot**: The new GraphQL mutation that records a shot as taken, applies proportional removal to the grog, marks the debt as delivered, creates a Pending_Add_Back record, and fires a push notification to the group.
- **redeemAddBack**: The new GraphQL mutation that applies a pending add-back to the grog and removes the Pending_Add_Back record.
- **clearAddBack**: The admin-only GraphQL mutation that removes a Pending_Add_Back record without applying it to the grog.
- **Grog_Resolver**: The backend Lambda resolver handling all grog mutations.
- **GrogService**: The app-side service module responsible for all grog-related API calls.
- **My_Slate**: The personal view screen showing outstanding punishments and items needing action.
- **Admin**: A group member whose `playerId` appears in the group's `adminIds` list, or who is the group creator.
- **Debtor**: The player who owes the grog punishment on a resolved debt.

---

## Requirements

### Requirement 1: Dismiss Sentence Screen Without Taking the Shot

**User Story:** As a debtor, I want to dismiss the Sentence Screen without taking the shot yet, so that I can close the screen when I'm not near the bottle and still owe the shot later.

#### Acceptance Criteria

1. THE Sentence_Screen SHALL display a "Take Later" button that allows the user to exit without calling any mutation.
2. WHEN the user taps "Take Later", THE app SHALL navigate back to the previous screen. No mutation is called, no state changes — the debt remains `resolved` with `debtPunishment = infinity_grog` exactly as before.
3. WHILE a debt has `status = resolved` and `debtPunishment = infinity_grog`, THE My_Slate SHALL continue to display it in the "Outstanding Punishments" section as a "Take Your Shot" card.
4. WHEN the debtor taps the "Take Your Shot" card on My_Slate, THE app SHALL navigate to the Sentence_Screen for that debt, showing the same full experience as the initial presentation.
5. THE user SHALL be able to dismiss the Sentence Screen any number of times — the punishment persists on My Slate until the shot is actually taken.

---

### Requirement 2: Shot Confirmation — takeGrogShot Mutation

**User Story:** As a debtor, I want tapping "Take the Shot" to immediately record my shot and mark the debt as delivered, so that the grog state is updated and my punishment is cleared from My Slate.

#### Acceptance Criteria

1. WHEN the debtor taps "Take the Shot" on the Sentence_Screen, THE Grog_Resolver SHALL apply proportional removal of one shot (44.36 mL) across all current grog entries in a single atomic `UpdateItem`.
2. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL append one `shot_taken` GrogHistoryEvent to the grog's `history` list with `actorPlayerId` = debtor, `amountMl` = 44.36, and `sourceDebtId` = the triggering `debtId`.
3. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL update the DEBT item status to `delivered` and set `deliveredAt` to the current ISO8601 timestamp.
4. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL update both PLAYERDEBT index items for the debt to `status = delivered`.
5. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL create a Pending_Add_Back record for the debtor associated with the `debtId` and `groupId`.
6. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL send a push notification to all group members indicating that the debtor took their grog shot.
7. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL write a `slap_delivered` FEED entry for the group.
8. IF a non-debtor player calls `takeGrogShot` for a debt they do not own, THEN THE Grog_Resolver SHALL return an authorization error and leave all state unchanged.
9. IF `takeGrogShot` is called for a `debtId` that is not in `resolved` status or does not have `debtPunishment = infinity_grog`, THEN THE Grog_Resolver SHALL return a validation error.
10. THE GrogService SHALL expose a `takeGrogShot(groupId: string, debtId: string): Promise<Grog>` method that calls the `takeGrogShot` mutation.

---

### Requirement 3: Post-Shot Add-Back Prompt

**User Story:** As a debtor, I want to be asked immediately after taking my shot whether I want to add a liquor back to the grog, so that I can act on it right away if I'm ready, or defer it to My Slate.

#### Acceptance Criteria

1. WHEN `takeGrogShot` completes successfully on the Sentence_Screen, THE Sentence_Screen SHALL display a dialog asking the debtor whether they want to add a liquor back to the grog now.
2. THE dialog SHALL present two options: one to add back now (navigating to the add-back form) and one to add back later (dismissing the dialog and navigating back to the previous screen).
3. WHEN the debtor selects "Add Back Now" from the post-shot dialog, THE Sentence_Screen SHALL present the add-back form (brand typeahead + category selector) and call `redeemAddBack` on submission.
4. WHEN the debtor selects "Add Back Later" from the post-shot dialog, THE Sentence_Screen SHALL navigate back to the previous screen without calling `redeemAddBack`, leaving the Pending_Add_Back record intact on My_Slate.
5. WHEN the debtor dismisses the post-shot dialog by selecting "Add Back Later", THE My_Slate SHALL display the pending add-back as a separate actionable item in the "Outstanding Punishments" section.

---

### Requirement 4: Pending Add-Back — DynamoDB Storage

**User Story:** As a developer, I want pending add-backs stored as a list on the GROG item, so that they are co-located with the grog state and retrievable in a single fetch.

#### Acceptance Criteria

1. THE GROG DynamoDB item SHALL include a `pendingAddBacks` attribute containing a list of maps, where each map represents one unredeemed add-back entitlement.
2. EACH pending add-back map SHALL contain: `debtId` (UUID of the triggering debt), `debtorId` (playerId of the debtor who took the shot), and `createdAt` (ISO8601 timestamp of when the shot was taken).
3. WHEN `takeGrogShot` is called, THE Grog_Resolver SHALL append one entry to `pendingAddBacks` in the same atomic write that applies proportional removal and updates the debt status.
4. WHEN `redeemAddBack` is called, THE Grog_Resolver SHALL remove the matching `pendingAddBacks` entry (matched by `debtId`) in the same atomic write that adds the liquor to the grog.
5. WHEN `clearAddBack` is called by an Admin, THE Grog_Resolver SHALL remove the matching `pendingAddBacks` entry (matched by `debtId`) without modifying the grog entries.
6. WHEN `adminAddBack` is called by an Admin with a valid `debtId`, `category`, and `brand`, THE Grog_Resolver SHALL add the liquor to the grog using the same merge logic as `addLiquorToGrog`, append an `addition` GrogHistoryEvent with `sourceDebtId` set to the `debtId`, and remove the matching `pendingAddBacks` entry — all in a single atomic write.
7. THE `Grog` GraphQL type SHALL include a `pendingAddBacks` field returning the list of pending add-back records so the app can display them without a separate fetch.

---

### Requirement 5: Redeem Add-Back — redeemAddBack Mutation

**User Story:** As a debtor, I want to submit my pending add-back from My Slate, so that I can add a liquor back to the grog at a time that's convenient for me.

#### Acceptance Criteria

1. WHEN a debtor or Admin calls `redeemAddBack` with a valid `debtId`, `category`, and `brand`, THE Grog_Resolver SHALL add the liquor to the grog using the same merge logic as `addLiquorToGrog` (merge if same brand+category exists, otherwise create new entry with `amountMl = SHOT_ML`).
2. WHEN `redeemAddBack` is called, THE Grog_Resolver SHALL append one `addition` GrogHistoryEvent to the grog's `history` list with `sourceDebtId` set to the `debtId` of the redeemed add-back.
3. WHEN `redeemAddBack` is called, THE Grog_Resolver SHALL remove the matching entry from `pendingAddBacks` in the same atomic write.
4. IF `redeemAddBack` is called by a player who is neither the debtor for that `debtId` nor an Admin, THEN THE Grog_Resolver SHALL return an authorization error and leave all state unchanged.
5. IF `redeemAddBack` is called with a `debtId` that has no matching entry in `pendingAddBacks`, THEN THE Grog_Resolver SHALL return a not-found error.
6. THE GrogService SHALL expose a `redeemAddBack(groupId: string, debtId: string, category: LiquorCategory, brand: string): Promise<Grog>` method that calls the `redeemAddBack` mutation.

---

### Requirement 6: Clear Add-Back — Admin Action

**User Story:** As a group admin, I want to clear a pending add-back without applying it, so that I can remove stale or invalid add-back entitlements.

#### Acceptance Criteria

1. WHEN an Admin calls `clearAddBack` with a valid `debtId`, THE Grog_Resolver SHALL remove the matching entry from `pendingAddBacks` without modifying the grog entries or history.
2. IF a non-Admin calls `clearAddBack`, THEN THE Grog_Resolver SHALL return an authorization error and leave all state unchanged.
3. IF `clearAddBack` is called with a `debtId` that has no matching entry in `pendingAddBacks`, THEN THE Grog_Resolver SHALL return a not-found error.
4. THE GrogService SHALL expose a `clearAddBack(groupId: string, debtId: string): Promise<Grog>` method that calls the `clearAddBack` mutation.

---

### Requirement 7: My Slate — Outstanding Grog Punishments

**User Story:** As a player, I want My Slate to show my own outstanding grog obligations as separate actionable items, so that I always know what I still owe.

#### Acceptance Criteria

1. WHILE a debt has `status = resolved`, `debtPunishment = infinity_grog`, and the shot has not yet been taken, THE My_Slate SHALL display a "Take Your Shot" card in the "Outstanding Punishments" section for the debtor.
2. WHEN the debtor taps the "Take Your Shot" card on My_Slate, THE app SHALL navigate to the Sentence_Screen for that debt.
3. WHILE a Pending_Add_Back record exists for the current player in a group's grog, THE My_Slate SHALL display an "Add Back to Grog" card in the "Outstanding Punishments" section.
4. WHEN the debtor taps the "Add Back to Grog" card on My_Slate, THE app SHALL present the add-back form (brand typeahead + category selector) and call `redeemAddBack` on submission.
5. My_Slate SHALL only show the current player's own obligations — admin controls for other players' pending add-backs are managed from the Grog Review screen, not My Slate.

---

### Requirement 8: GraphQL Schema Extensions

**User Story:** As a developer, I want the GraphQL schema updated to expose the new mutations and the pending add-back type, so that the app can interact with the new flow through the existing AppSync API.

#### Acceptance Criteria

1. THE GraphQL schema SHALL define a `PendingAddBack` type with fields: `debtId: ID!`, `debtorId: ID!`, and `createdAt: AWSDateTime!`.
2. THE GraphQL schema SHALL add a `pendingAddBacks: [PendingAddBack!]!` field to the existing `Grog` type.
3. THE GraphQL schema SHALL define a `takeGrogShot(groupId: ID!, debtId: ID!)` mutation that returns the updated `Grog!`.
4. THE GraphQL schema SHALL define a `redeemAddBack(groupId: ID!, debtId: ID!, category: LiquorCategory!, brand: String!)` mutation that returns the updated `Grog!`.
5. THE GraphQL schema SHALL define a `clearAddBack(groupId: ID!, debtId: ID!)` mutation that returns the updated `Grog!`.
6. THE GraphQL schema SHALL define an `adminAddBack(groupId: ID!, debtId: ID!, category: LiquorCategory!, brand: String!)` mutation that returns the updated `Grog!`.
7. THE existing `confirmGrogDelivery` mutation SHALL be retained in the schema for backwards compatibility but SHALL NOT be called by the app for new shot delivery flows.

---

### Requirement 9: TypeScript Types

**User Story:** As a developer, I want TypeScript types for the new pending add-back model, so that the app has strict type coverage for the new flow.

#### Acceptance Criteria

1. THE `app/src/types/index.ts` file SHALL export a `PendingAddBack` interface with fields: `debtId: string`, `debtorId: string`, and `createdAt: string`.
2. THE `Grog` interface in `app/src/types/index.ts` SHALL be updated to include a `pendingAddBacks: PendingAddBack[]` field.
3. THE `GrogHistoryEventType` type SHALL remain unchanged — `takeGrogShot` produces a `shot_taken` event and `redeemAddBack` produces an `addition` event, both already covered by the existing union.

### Requirement 10: Grog Review Screen — Admin Manage Mode

**User Story:** As a group admin, I want a "Manage Grog" mode on the Review screen so that I can perform admin actions without the management controls cluttering the regular view that all players see.

#### Acceptance Criteria

1. THE Grog Review screen SHALL display identically for all players by default — skull visualization, contents drawer, and history log with no admin controls visible.
2. WHEN the current player is an Admin, THE Review Screen SHALL display a "Manage" button in the header that toggles the screen into Manage Mode.
3. WHEN Manage Mode is active, THE Review Screen header SHALL indicate the mode change (e.g. "Managing Grog") and the "Manage" button SHALL change to a "Done" button to exit Manage Mode.
4. WHILE in Manage Mode, THE Review Screen SHALL display admin controls for grog entries: add liquor, per-entry remove, and per-entry volume adjustment.
5. WHILE in Manage Mode, THE Review Screen SHALL display a "Pending Add-Backs" section listing all outstanding add-back entitlements with the debtor's username and date. Each entry SHALL have a "Clear" action (calls `clearAddBack`) and an "Add Shot" action (presents brand typeahead + category selector, calls `adminAddBack` on submission).
6. WHILE in Manage Mode and no grog exists yet, THE Review Screen SHALL display an "Initialize Grog" button.
7. WHEN Manage Mode is not active, none of the admin controls described in criteria 4–6 SHALL be visible.
8. IF there are no pending add-backs, THE pending add-backs section SHALL NOT be shown in Manage Mode.

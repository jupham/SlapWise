# Requirements Document

## Introduction

The Infinity Grog is a shared group drinking vessel tracked in the SlapWise app. One grog exists per group. When a Manchester debt resolves with an `infinity_grog` punishment, the debtor must take a shot from the grog. The grog is a living record of every liquor that has been added to it over time, with a full history log of additions and removals. The feature includes a dramatic full-screen "Sentence" reveal screen and a browsable "Review" mode accessible from the Group Detail screen.

## Glossary

- **Grog**: The single shared group drinking vessel for a given group. Stored as a `GROG#<groupId>` item in DynamoDB.
- **GrogEntry**: One liquor entry in the grog. Tracks the current remaining volume of a specific brand/category. Player attribution is not stored here — it lives in the history log.
- **GrogHistoryEvent**: An immutable log record of a single action on the grog. Types: `addition` (liquor added), `shot_taken` (debtor took a shot). Admin adjustments are corrections only and do not produce history events.
- **LiquorCategory**: One of eleven enumerated categories representing spirits with a minimum 40% ABV: `vodka`, `whiskey`, `bourbon`, `scotch`, `irish_whiskey`, `canadian_whiskey`, `rum`, `gin`, `tequila`, `brandy`, `other`.
- **Shot**: The standard unit of consumption. Always 1.5 US fluid ounces (44.36 mL). One shot is removed from the grog each time a debtor confirms delivery.
- **BottleSize**: The total capacity of the grog stored internally in millilitres (float). Admins may enter the bottle size in either oz or mL — the UI converts to mL before storing. Common presets: 375 mL, 750 mL, 1000 mL, 1750 mL.
- **FillLevel**: Computed as `sum(entry.amountMl) / bottleSize`. Drives the skull liquid visualization height.
- **Sentence Screen**: The full-screen dramatic reveal shown when a debt resolves with an `infinity_grog` punishment.
- **Review Screen**: The browsable grog state screen accessible from Group Detail without a punishment context.
- **GrogService**: The app-side service module responsible for all grog-related API calls.
- **Grog_Resolver**: The backend Lambda resolver handling grog mutations.
- **Admin**: A group member whose `playerId` appears in the group's `adminIds` list, or who is the group creator.
- **Proportional Removal**: When a shot is taken, each existing entry's effective volume is reduced evenly across all entries so the total decreases by one shot.

---

## Requirements

### Requirement 1: Grog Data Model

**User Story:** As a developer, I want a well-defined DynamoDB item for the grog, so that the grog state and history are stored reliably in the existing single-table design.

#### Acceptance Criteria

1. THE Grog SHALL be stored as a single DynamoDB item with `PK = GROG#<groupId>` and `SK = METADATA`.
2. THE Grog item SHALL contain: `groupId` (UUID), `bottleSize` (float, millilitres), `entries` (list of GrogEntry), and `history` (list of GrogHistoryEvent).
3. THE GrogEntry SHALL contain: `entryId` (UUID), `category` (LiquorCategory), `brand` (string), and `amountMl` (float — current remaining volume in mL). No player attribution is stored on the entry itself.
4. THE GrogHistoryEvent SHALL contain: `eventId` (UUID), `type` (`addition` or `shot_taken`), `actorPlayerId` (playerId), `occurredAt` (ISO8601), `sourceDebtId` (UUID or null), `brand` (string or null — present on `addition` events), `category` (LiquorCategory or null — present on `addition` events), and `amountMl` (float or null — present on all event types).
5. THE Grog item SHALL NOT be created automatically — it is created explicitly via the `initializeGrog` mutation.

---

### Requirement 2: Admin Liquor Management

**User Story:** As a group admin, I want to add or remove liquors from the grog at any time, so that I can manage the grog's contents outside of punishment events.

#### Acceptance Criteria

1. WHEN an Admin submits an add-liquor request with a valid `category` and `brand`, THE Grog_Resolver SHALL either create a new GrogEntry with `amountMl = SHOT_ML` or merge into an existing entry with the same `brand` and `category`, and SHALL append a corresponding `addition` GrogHistoryEvent to the `history` list.
2. WHEN an Admin submits a remove-liquor request referencing an `entryId` that exists in the grog's `entries` list, THE Grog_Resolver SHALL remove that GrogEntry from `entries`. No history event is written for admin removals.
3. IF a non-Admin player submits an add-liquor or remove-liquor request, THEN THE Grog_Resolver SHALL return an authorization error and leave the grog unchanged.
4. IF an Admin submits a remove-liquor request referencing an `entryId` that does not exist in the grog's `entries` list, THEN THE Grog_Resolver SHALL return a not-found error.
5. THE GrogService SHALL expose `addLiquor(groupId, category, brand)` and `removeLiquor(groupId, entryId)` methods that call the corresponding GraphQL mutations.

---

### Requirement 3: Shot Delivery and Proportional Removal

**User Story:** As a debtor, I want to confirm I took a shot from the grog when my `infinity_grog` punishment is delivered, so that the grog accurately reflects the consumed volume.

#### Acceptance Criteria

1. WHEN a debtor confirms delivery of an `infinity_grog` punishment, THE Grog_Resolver SHALL apply proportional removal across all current GrogEntry objects, reducing the total effective volume by one shot.
2. WHEN proportional removal results in a GrogEntry's effective volume reaching zero, THE Grog_Resolver SHALL remove that GrogEntry from the `entries` list.
3. WHEN a shot is taken, THE Grog_Resolver SHALL append one `shot_taken` GrogHistoryEvent to the `history` list with `actorPlayerId` = debtor, `amountMl` = `SHOT_ML`, and `sourceDebtId` = the triggering debt.
4. WHEN a debtor confirms delivery of an `infinity_grog` punishment and chooses to add a liquor back, THE Grog_Resolver SHALL apply proportional removal first, then append the new GrogEntry and its corresponding `addition` GrogHistoryEvent in the same atomic write.
5. IF a debtor confirms delivery of an `infinity_grog` punishment and chooses to add a liquor back, THEN the corresponding `addition` GrogHistoryEvent SHALL have `sourceDebtId` set to the `debtId` of the triggering debt.
6. THE GrogService SHALL expose a `confirmGrogDelivery(groupId, debtId, addBack?: { category, brand })` method that calls the corresponding GraphQL mutation.

---

### Requirement 4: Fetch Grog State

**User Story:** As a group member, I want to fetch the current grog state and history, so that I can view what's in the grog and how it got there.

#### Acceptance Criteria

1. WHEN a group member requests the grog for a given `groupId`, THE Grog_Resolver SHALL return the current GrogEntry list and full GrogHistoryEvent list for that group.
2. IF no grog item exists for the requested `groupId`, THEN THE Grog_Resolver SHALL return a grog with empty `entries` and `history` lists rather than an error.
3. THE GrogService SHALL expose a `getGrog(groupId)` method that calls the corresponding GraphQL query and returns a typed `Grog` object.

---

### Requirement 5: GraphQL Schema Extensions

**User Story:** As a developer, I want the GraphQL schema to expose grog types and operations, so that the app can interact with the grog through the existing AppSync API.

#### Acceptance Criteria

1. THE GraphQL schema SHALL define a `LiquorCategory` enum with values: `vodka`, `whiskey`, `bourbon`, `scotch`, `irish_whiskey`, `canadian_whiskey`, `rum`, `gin`, `tequila`, `brandy`, `other`.
2. THE GraphQL schema SHALL define a `GrogEntry` type with fields: `entryId`, `category`, `brand`, and `amountMl`.
3. THE GraphQL schema SHALL define a `GrogHistoryEvent` type with fields: `eventId`, `type` (`addition` or `shot_taken`), `actorPlayerId`, `occurredAt`, `sourceDebtId`, `brand`, `category`, and `amountMl`.
4. THE GraphQL schema SHALL define a `Grog` type with fields: `groupId`, `bottleSize`, `entries`, and `history`.
5. THE GraphQL schema SHALL define a `getGrog(groupId: ID!)` query that returns a `Grog`.
6. THE GraphQL schema SHALL define an `initializeGrog(groupId: ID!, bottleSize: Float!, seedEntries: [AddLiquorInput!])` mutation that returns the created `Grog`.
7. THE GraphQL schema SHALL define an `addLiquorToGrog(groupId: ID!, category: LiquorCategory!, brand: String!)` mutation that returns the updated `Grog`.
8. THE GraphQL schema SHALL define a `removeLiquorFromGrog(groupId: ID!, entryId: ID!)` mutation that returns the updated `Grog`.
9. THE GraphQL schema SHALL define a `confirmGrogDelivery(groupId: ID!, debtId: ID!, addBack: AddLiquorInput)` mutation that returns the updated `Grog`.
10. THE GraphQL schema SHALL define an `adjustGrogEntry(groupId: ID!, entryId: ID!, amountMl: Float!)` mutation for admin corrections that returns the updated `Grog`. Setting `amountMl` to 0 removes the entry.

---

### Requirement 6: Sentence Screen

**User Story:** As a debtor, I want a dramatic full-screen reveal when my debt resolves with an `infinity_grog` punishment, so that the moment feels appropriately weighty and theatrical.

#### Acceptance Criteria

1. WHEN a debt resolves with `debtPunishment = infinity_grog`, THE Sentence Screen SHALL be displayed to the debtor as a full-screen modal.
2. THE Sentence Screen SHALL display an animated skull SVG that drops onto the screen using a react-native-reanimated v4 entry animation.
3. THE Sentence Screen SHALL display a layered liquid visualization inside the skull SVG, where each LiquorCategory is represented by a distinct color: `vodka` = ice blue (`#A8D8EA`), `whiskey` = light amber (`#C8860A`), `bourbon` = deep amber/orange (`#B85C00`), `scotch` = smoky gold (`#8B7536`), `irish_whiskey` = warm gold (`#D4A017`), `canadian_whiskey` = pale amber (`#E8C97A`), `rum` = dark mahogany (`#4A1C00`), `gin` = pale green (`#A8D5A2`), `tequila` = bright gold (`#F0C040`), `brandy` = deep burgundy (`#7B1C3E`), `other` = purple (`#7B5EA7`).
4. THE Sentence Screen SHALL animate the liquid layers using a sine wave slosh animation via react-native-reanimated v4.
5. THE Sentence Screen SHALL display the current grog entries proportionally as stacked liquid layers, where each layer's height is proportional to that entry's `amountMl` relative to the total `amountMl` across all entries.
6. WHEN the user scrolls down on the Sentence Screen, THE Sentence Screen SHALL display the grog history log below the skull visualization.
7. THE Sentence Screen SHALL display a "Take the Shot" button that, when pressed, navigates to the delivery confirmation flow for the `infinity_grog` punishment.
8. THE Sentence Screen SHALL resolve player IDs to usernames using the group member list before displaying any player-attributed history entries.

---

### Requirement 7: Review Screen

**User Story:** As a group member, I want to browse the grog state from the Group Detail screen at any time, so that I can see what's in the grog without needing an active punishment.

#### Acceptance Criteria

1. THE Group Detail screen SHALL display a "View the Grog" navigation entry that opens the Review Screen.
2. THE Review Screen SHALL display the same skull SVG and layered liquid visualization as the Sentence Screen, without the drop animation.
3. THE Review Screen SHALL display the full grog history log below the skull visualization.
4. THE Review Screen SHALL display a list of current GrogEntry objects showing category, brand, and current volume (in mL and oz).
5. WHILE the current player is an Admin, THE Review Screen SHALL display controls to: add a liquor, remove an entry, and adjust an entry's `amountMl` directly (for corrections).
6. THE Review Screen SHALL resolve all player IDs to usernames using the group member list.
7. WHEN the Review Screen is mounted, THE Review Screen SHALL fetch the grog state and group members in parallel using `Promise.all`.

---

### Requirement 8: Add Liquor UI

**User Story:** As a group member adding a liquor to the grog, I want a typeahead brand picker with common brands bundled client-side, so that entry is fast and consistent.

#### Acceptance Criteria

1. THE Add Liquor form SHALL present a brand name text input with typeahead suggestions drawn from a client-side list of common brands, where each suggestion has a pre-associated `LiquorCategory`.
2. WHEN a user selects a typeahead suggestion, THE Add Liquor form SHALL auto-populate both the brand name field and the category selector with the values from that suggestion.
3. THE Add Liquor form SHALL display a `LiquorCategory` selector that the user can override regardless of whether a suggestion was selected.
4. THE Add Liquor form SHALL allow free-text brand entry for brands not present in the typeahead list, in which case the user must manually select a category.
5. WHEN the user submits the Add Liquor form with a valid category and non-empty brand name, THE GrogService SHALL call `addLiquor` and the UI SHALL reflect the updated grog state.
6. IF the Add Liquor form is submitted with an empty brand name or no category selected, THEN THE Add Liquor form SHALL display a validation error and SHALL NOT submit the request.
7. THE client-side brand list SHALL include a comprehensive set of well-known brands across all eleven categories. The list SHALL contain a minimum of 15 brands per major whiskey subcategory (bourbon, scotch, irish_whiskey) and a minimum of 10 brands per other category, covering a range of price points from well spirits to premium expressions.

---

### Requirement 9: Navigation Integration

**User Story:** As a developer, I want the grog screens integrated into the existing React Navigation stack, so that navigation to and from grog screens is consistent with the rest of the app.

#### Acceptance Criteria

1. THE `RootStackParamList` SHALL include an `InfinityGrogSentence` route with params `{ debtId: string; groupId: string; groupName: string }`.
2. THE `RootStackParamList` SHALL include an `InfinityGrogReview` route with params `{ groupId: string; groupName: string }`.
3. WHEN a debt resolves with `debtPunishment = infinity_grog` and the current player is the debtor, THE app SHALL navigate to the `InfinityGrogSentence` screen.
4. WHEN the user completes or dismisses the Sentence Screen, THE app SHALL navigate back to the appropriate screen (My Slate or Group Feed).

---

### Requirement 10: TypeScript Types

**User Story:** As a developer, I want all grog-related TypeScript types defined in `app/src/types/index.ts`, so that the app has strict type coverage for the feature.

#### Acceptance Criteria

1. THE `app/src/types/index.ts` file SHALL export a `LiquorCategory` type as a union of the eleven category string literals: `'vodka' | 'whiskey' | 'bourbon' | 'scotch' | 'irish_whiskey' | 'canadian_whiskey' | 'rum' | 'gin' | 'tequila' | 'brandy' | 'other'`.
2. THE `app/src/types/index.ts` file SHALL export a `GrogEntry` interface with fields: `entryId: string`, `category: LiquorCategory`, `brand: string`, `amountMl: number`.
3. THE `app/src/types/index.ts` file SHALL export a `GrogHistoryEvent` interface with fields: `eventId: string`, `type: GrogHistoryEventType`, `actorPlayerId: string`, `occurredAt: string`, `sourceDebtId: string | null`, `brand: string | null`, `category: LiquorCategory | null`, `amountMl: number | null`.
4. THE `app/src/types/index.ts` file SHALL export a `Grog` interface with fields `groupId: string`, `bottleSize: number`, `entries: GrogEntry[]`, and `history: GrogHistoryEvent[]`.
5. THE `app/src/types/index.ts` file SHALL export a `GrogHistoryEventType` type as a union of `'addition'` and `'shot_taken'`.

---

### Requirement 11: Grog Initialization

**User Story:** As a group admin, I want to initialize the infinity grog by setting a bottle size and optionally seeding it with an initial set of liquors, so that the grog is ready to use before any punishments are issued.

#### Acceptance Criteria

1. WHEN an Admin calls `initializeGrog` with a `bottleSize` and an optional `seedEntries` list, THE Grog_Resolver SHALL create the `GROG#<groupId>` item with the given `bottleSize`, the provided seed entries (if any), and corresponding `addition` history events for each seed entry.
2. THE `bottleSize` SHALL be stored in millilitres as a float. The constant `SHOT_ML = 44.36` (1.5 US fl oz) SHALL be used for all shot calculations.
3. IF `seedEntries` is provided, THE total volume of seed entries (`seedEntries.length × 44.36` mL) SHALL NOT exceed `bottleSize`. IF it does, THE Grog_Resolver SHALL return a validation error.
4. IF a grog item already exists for the group, THE `initializeGrog` mutation SHALL return an error and leave the existing grog unchanged.
5. IF a non-Admin calls `initializeGrog`, THE Grog_Resolver SHALL return an authorization error.
6. THE Review Screen SHALL display an "Initialize Grog" button when the current player is an Admin and no grog exists yet for the group.
7. THE Initialize Grog UI SHALL present a numeric input for `bottleSize` and an optional multi-entry form to seed initial liquors, using the same category selector and brand typeahead as the Add Liquor form.
8. THE skull visualization SHALL display the fill level as `sum(entry.amountMl) / bottleSize`, so a partially-seeded grog renders as partially full rather than always full.
9. THE GrogService SHALL expose an `initializeGrog(groupId, bottleSize, seedEntries?)` method that calls the `initializeGrog` mutation.
10. THE `Grog` type SHALL include `bottleSize` so the UI can always compute fill percentage without additional fetches.

---

### Requirement 12: Admin Grog Corrections

**User Story:** As a group admin, I want to directly adjust grog entry volumes, add missing entries, or remove incorrect entries to fix mistakes, without polluting the history log.

#### Acceptance Criteria

1. WHEN an Admin calls `adjustGrogEntry` with a valid `entryId` and `amountMl > 0`, THE Grog_Resolver SHALL update that entry's `amountMl` to the provided value. No history event is written.
2. WHEN an Admin calls `adjustGrogEntry` with `amountMl = 0`, THE Grog_Resolver SHALL remove that entry from `entries`. No history event is written.
3. WHEN an Admin calls `removeLiquorFromGrog` with a valid `entryId`, THE Grog_Resolver SHALL remove that entry from `entries`. No history event is written.
4. IF a non-Admin calls `adjustGrogEntry`, THE Grog_Resolver SHALL return an authorization error.
5. THE Review Screen SHALL display an editable volume field per entry when the current player is an Admin, allowing direct `amountMl` correction.
6. THE GrogService SHALL expose an `adjustGrogEntry(groupId, entryId, amountMl)` method that calls the `adjustGrogEntry` mutation.

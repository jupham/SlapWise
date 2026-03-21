# Implementation Plan: Social Slap Tracker

## Overview

Incremental implementation of the Social Slap Tracker React Native app. Infrastructure is provisioned via AWS CDK (TypeScript) in a dedicated `infrastructure/` directory (a standalone CDK project alongside the React Native `app/` directory). The React Native client uses the Amplify SDK (auth, AppSync, DataStore, Pinpoint) configured manually via `Amplify.configure()` using values from CDK stack outputs — no Amplify CLI is used. Tasks build from infrastructure setup through authentication, group management, game mechanics, notifications, and feed — wiring everything together at the end.

## Tasks

- [x] 1. Set up project structure, CDK infrastructure, and core TypeScript types
  - Initialise React Native project in `app/` (without Amplify CLI)
  - Create `infrastructure/` CDK app (TypeScript) with the following stacks:
    - `CognitoStack`: User Pool with pre-sign-up and post-confirmation Lambda triggers, app client, Identity Pool
    - `DynamoStack`: `SlapTracker` single-table with all GSIs (GSI1, GSI2, GSI3) and TTL attribute on invite code items
    - `LambdaStack`: all Lambda functions — pre-sign-up trigger, post-confirmation trigger, `createGroup`, `joinGroup`, `submitResolutionConfirmation`, `confirmDelivery`, `recordGameCall`, `leaveGroup`, `notificationDispatcher` — with IAM roles and environment variables
    - `AppSyncStack`: GraphQL API, schema, all data sources and resolver attachments (VTL + Lambda), Cognito auth mode
    - `ApiGatewayStack`: REST API wiring group management Lambda functions (`createGroup`, `joinGroup`)
    - `NotificationsStack`: SNS topic, Pinpoint app, IAM roles for Lambda → SNS publish
  - Export CDK stack outputs (ARNs, endpoints, IDs) and generate `amplifyconfiguration.json` for the React Native app
  - Configure the React Native app to call `Amplify.configure()` using the values from CDK stack outputs (no Amplify CLI)
  - Define all TypeScript interfaces and types from the design: `Player`, `Group`, `Member`, `SlapDebt`, `CustomGame`, `ChugEvent`, `FeedEntry`, `Notification`, `InviteCode`
  - Define DynamoDB key constants (`PK`/`SK` patterns, GSI names)
  - Set up Zustand store skeleton with slices for auth, groups, debts, feed, notifications
  - Configure Jest/Vitest with fast-check for property-based testing
  - _Requirements: 0.1, 1.1, 7.1_

  - [x] 1.1 Write CDK stacks in `infrastructure/`
    - `CognitoStack`: `UserPool` with `preSignUp` and `postConfirmation` Lambda triggers, `UserPoolClient`, `IdentityPool`
    - `DynamoStack`: `Table` with `PK`/`SK` keys, GSI1 (`GSI1PK`/`GSI1SK`), GSI2 (`GSI2PK`/`GSI2SK`), GSI3 (`GSI3PK`/`GSI3SK`), TTL attribute `TTL`
    - `LambdaStack`: `NodejsFunction` constructs for each handler with correct IAM grants (`table.grantReadWriteData`, `snsTopic.grantPublish`) and environment variables (`TABLE_NAME`, `SNS_TOPIC_ARN`, etc.)
    - `AppSyncStack`: `GraphqlApi` with Cognito default auth, `DynamoDbDataSource` and `LambdaDataSource` constructs, `Resolver` attachments for every query/mutation/subscription
    - `ApiGatewayStack`: `RestApi` with `POST /groups` and `POST /groups/join` resources backed by Lambda integrations and Cognito authorizer
    - `NotificationsStack`: `Topic` (SNS), Pinpoint `CfnApp`, IAM policy granting Lambda publish rights
    - Wire stack dependencies and export outputs; add a `cdk-outputs.json` → `amplifyconfiguration.json` generation script so the React Native app can call `Amplify.configure()` with CDK-deployed resource values
    - _Requirements: 0.1, 1.1, 1.2, 1.3, 6.1, 7.1_

- [x] 2. Implement authentication module
  - [x] 2.1 Implement Cognito pre-sign-up Lambda trigger for username uniqueness
    - Write the handler code for the Lambda already declared in `LambdaStack` (function definition, IAM role, and Cognito trigger attachment are in CDK)
    - Handler checks `USERNAME#<username>` item in DynamoDB; throws `UserLambdaValidationException` with code `USERNAME_TAKEN` if taken
    - _Requirements: 0.3_

  - [x] 2.2 Implement Cognito post-confirmation Lambda trigger
    - Write the handler code for the Lambda already declared in `LambdaStack`
    - Handler writes `PLAYER#<playerId> / PROFILE` item and `USERNAME#<username> / LOOKUP` item to DynamoDB on successful confirmation
    - _Requirements: 0.1, 0.7_

  - [x] 2.3 Implement `AuthService` (register, login, logout, currentPlayer)
    - Wire Amplify Auth `signUp`, `signIn`, `signOut`, `getCurrentUser` to the `AuthService` interface
    - Map Cognito errors (`UsernameExistsException`, `NotAuthorizedException`) to `REGISTRATION_CONFLICT` / generic login error
    - _Requirements: 0.1, 0.2, 0.4, 0.5, 0.6_

  - [x] 2.4 Build registration and login screens
    - Registration form: username, email, password fields with inline validation
    - Login form: email, password with error display
    - _Requirements: 0.1, 0.2, 0.3, 0.4, 0.5_

  - [ ]* 2.5 Write property test for registration uniqueness (Property 1)
    - **Property 1: Registration uniqueness**
    - **Validates: Requirements 0.2, 0.3**
    - `// Feature: social-slap-tracker, Property 1: For any two registration attempts sharing email or username, the second must fail`

  - [ ]* 2.6 Write property test for registration and login round-trip (Property 2)
    - **Property 2: Registration and login round-trip**
    - **Validates: Requirements 0.1, 0.4, 0.5, 0.6**
    - `// Feature: social-slap-tracker, Property 2: Register then login returns same playerId; logout makes currentPlayer() null`

  - [ ]* 2.7 Write property test for action attribution (Property 3)
    - **Property 3: Action attribution**
    - **Validates: Requirements 0.7**
    - `// Feature: social-slap-tracker, Property 3: Any authenticated player action carries that player's ID in the resulting record`

- [ ] 3. Checkpoint — ensure all tests pass, ask the user if questions arise.

- [ ] 4. Implement group management
  - [ ] 4.1 Implement `createGroup` Lambda function
    - Write the handler code for the Lambda already declared in `LambdaStack` (function definition, API Gateway integration, IAM role, and environment variables are in CDK)
    - Handler creates `GROUP#<groupId> / METADATA` item with `creatorId`, `adminIds`, and generated `inviteCode`; writes `GROUP#<groupId> / MEMBER#<playerId>` item; writes `GROUP#<groupId> / INVITE#<code>` item
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 4.2 Implement `joinGroup` Lambda function
    - Write the handler code for the Lambda already declared in `LambdaStack`
    - Handler validates invite code (checks `active` flag and TTL), adds `MEMBER` item via DynamoDB transaction, returns group data; returns `INVALID_INVITE_CODE` (HTTP 400) on failure
    - _Requirements: 1.4, 1.5_

  - [ ] 4.3 Implement AppSync resolvers for `getGroups` and `getGroupMembers`
    - Write the resolver logic (VTL) for resolvers already attached in `AppSyncStack` (data source and resolver attachment are in CDK)
    - `getGroups`: query GSI1 with `PLAYER#<playerId>` to return all groups for the current player
    - `getGroupMembers`: query `GROUP#<groupId> / MEMBER#*` items
    - Wire AppSync subscriptions to Zustand store slices
    - _Requirements: 1.6, 1.7_

  - [ ] 4.4 Implement `designateAdmin` AppSync mutation resolver
    - Write the resolver logic (VTL) for the resolver already attached in `AppSyncStack`
    - Resolver checks caller is `creatorId`; if not, returns `PERMISSION_DENIED`; otherwise appends `playerId` to `adminIds` set
    - _Requirements: 1.8, 1.9_

  - [ ] 4.5 Implement `regenerateInviteCode` mutation
    - Write the resolver logic (VTL or Lambda handler) for the resolver already attached in `AppSyncStack`
    - Deactivates old invite code item; writes new `INVITE#<code>` item; updates `inviteCode` on group metadata
    - _Requirements: 1.3_

  - [ ] 4.6 Build group list, group detail, and invite screens
    - Group list screen showing all player groups
    - Group detail screen with member list and admin controls
    - Invite code display and share sheet
    - Join group screen with invite code input and error display
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [ ]* 4.7 Write property test for group creation invariants (Property 4)
    - **Property 4: Group creation invariants**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - `// Feature: social-slap-tracker, Property 4: Creator appears in creatorId and adminIds; inviteCode is non-null`

  - [ ]* 4.8 Write property test for invite code join round-trip (Property 5)
    - **Property 5: Invite code join round-trip**
    - **Validates: Requirements 1.4, 1.5**
    - `// Feature: social-slap-tracker, Property 5: Valid code adds player to members; invalid/expired code fails with error`

  - [ ]* 4.9 Write property test for group and member list completeness (Property 6)
    - **Property 6: Group and member list completeness**
    - **Validates: Requirements 1.6, 1.7**
    - `// Feature: social-slap-tracker, Property 6: N joined groups returns exactly N; M members returns exactly M`

  - [ ]* 4.10 Write property test for admin designation authorization (Property 7)
    - **Property 7: Admin designation authorization**
    - **Validates: Requirements 1.8, 1.9**
    - `// Feature: social-slap-tracker, Property 7: Non-creator designation fails; creator designation updates adminIds`

- [ ] 5. Checkpoint — ensure all tests pass, ask the user if questions arise.

- [ ] 6. Implement Manchester challenge creation
  - [ ] 6.1 Implement `createChallenge` AppSync mutation and resolver
    - Resolver validates challenger ≠ statementMaker (returns `SELF_CHALLENGE_ERROR`), validates statement text present; writes `DEBT#<debtId>` item with `status: "pending"`, `gameType: "manchester"`, `GSI2PK` set to `GROUP#<groupId>#STATUS#pending`
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

  - [ ] 6.2 Implement `getPendingDebts` AppSync query
    - Query GSI2 with `GROUP#<groupId>#STATUS#pending` to return pending debts; wire subscription for real-time updates
    - _Requirements: 2.4_

  - [ ] 6.3 Build Manchester challenge creation screen
    - Statement maker picker (excludes self), statement text input, submit button with validation errors
    - Pending debts list screen
    - _Requirements: 2.1, 2.2, 2.4, 2.5_

  - [ ]* 6.4 Write property test for challenge validation (Property 8)
    - **Property 8: Challenge validation**
    - **Validates: Requirements 2.2, 2.5**
    - `// Feature: social-slap-tracker, Property 8: Self-challenge and missing-field submissions must fail`

  - [ ]* 6.5 Write property test for new Manchester debt is pending (Property 9)
    - **Property 9: New Manchester debt is pending**
    - **Validates: Requirements 2.3, 2.4**
    - `// Feature: social-slap-tracker, Property 9: Valid challenge creates debt with status=pending visible in pending query`

- [ ] 7. Implement Manchester challenge resolution
  - [ ] 7.1 Implement `submitResolutionConfirmation` Lambda resolver
    - Validate caller is challenger or statementMaker (else `UNAUTHORIZED`); validate debt is not terminal (else `DEBT_ALREADY_TERMINAL`); validate caller is group member (else `UNAUTHORIZED`)
    - First confirmation: record outcome on `challengerConfirmation` or `statementMakerConfirmation`, set `status: "pending_confirmation"` via conditional DynamoDB write
    - Second confirmation: compare outcomes; if both `followed_through` → set `debtorId=challengerId`, `creditorId=statementMakerId`, `status: "resolved"`, `resolvedAt`; if both `did_not_follow_through` → reverse; if disagree → `status: "disputed"`; update `GSI2PK` and `GSI3PK` accordingly
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [ ] 7.2 Build resolution confirmation screen
    - Show debt details; outcome selector (followed through / did not follow through); submit button
    - Display pending confirmation state when waiting for second party
    - Display disputed state with manual review flag
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

  - [ ]* 7.3 Write property test for two-party confirmation invariant (Property 10)
    - **Property 10: Two-party confirmation invariant**
    - **Validates: Requirements 3.2, 3.3, 4.3**
    - `// Feature: social-slap-tracker, Property 10: Single confirmation must not advance debt to final state`

  - [ ]* 7.4 Write property test for confirmation authorization (Property 11)
    - **Property 11: Confirmation authorization**
    - **Validates: Requirements 3.1, 3.9**
    - `// Feature: social-slap-tracker, Property 11: Non-party or non-member confirmation attempt must fail`

  - [ ]* 7.5 Write property test for resolution outcome correctness (Property 12)
    - **Property 12: Resolution outcome correctness**
    - **Validates: Requirements 3.5, 3.6, 3.7**
    - `// Feature: social-slap-tracker, Property 12: Both-agree outcomes set correct debtor/creditor; disagreement sets disputed`

  - [ ]* 7.6 Write property test for resolved debt has timestamp (Property 13)
    - **Property 13: Resolved debt has timestamp**
    - **Validates: Requirements 3.8**
    - `// Feature: social-slap-tracker, Property 13: Resolved debt has non-null ISO 8601 resolvedAt`

  - [ ]* 7.7 Write property test for no re-confirmation of terminal debts (Property 14)
    - **Property 14: No re-confirmation of terminal debts**
    - **Validates: Requirements 3.10**
    - `// Feature: social-slap-tracker, Property 14: Confirmation on resolved/disputed/delivered debt must fail`

- [ ] 8. Checkpoint — ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement slap debt ledger and delivery confirmation
  - [ ] 9.1 Implement `getDebts` AppSync query with filters
    - Query GSI2 by status; support filter parameters for `gameType`, `playerId`, `status`; wire subscription
    - _Requirements: 4.1, 4.5_

  - [ ] 9.2 Implement `getNetSummary` AppSync resolver
    - Aggregate resolved-but-not-delivered debts per player pair; exclude delivered debts from summary
    - _Requirements: 4.2, 4.4_

  - [ ] 9.3 Implement `confirmDelivery` Lambda resolver
    - Record `debtorDeliveryConfirmed` or `creditorDeliveryConfirmed` on first call; on second call set `status: "delivered"`, `deliveredAt` via conditional DynamoDB write; update `GSI2PK`
    - _Requirements: 4.3, 4.4_

  - [ ] 9.4 Build ledger screen with filter controls and net summary
    - Ledger list with debtor, creditor, reason, game, timestamp columns
    - Filter bar (game type, player, status)
    - Net summary section per player pair
    - Delivery confirmation action
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 9.5 Write property test for ledger completeness and net summary consistency (Property 15)
    - **Property 15: Ledger completeness and net summary consistency**
    - **Validates: Requirements 4.1, 4.2, 4.4**
    - `// Feature: social-slap-tracker, Property 15: Ledger contains all N resolved debts; net summary arithmetic correct; delivered excluded`

  - [ ]* 9.6 Write property test for ledger filter correctness (Property 16)
    - **Property 16: Ledger filter correctness**
    - **Validates: Requirements 4.5**
    - `// Feature: social-slap-tracker, Property 16: All returned debts satisfy filter; no matching debt omitted`

- [ ] 10. Implement custom game support
  - [ ] 10.1 Implement `createGame` AppSync mutation resolver
    - Check for duplicate name within group (query `GROUP#<groupId> / GAME#*` items); return error if duplicate; write `GAME#<gameId>` item
    - _Requirements: 5.1, 5.2, 5.5_

  - [ ] 10.2 Implement `getGames` AppSync query and `createDebt` for custom games
    - Query `GROUP#<groupId> / GAME#*` items; wire subscription
    - `createDebt` mutation: writes `DEBT#<debtId>` with `gameType: "custom"`, `customGameId`, `debtorId`, `creditorId`, `reason`
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ] 10.3 Build custom game screens
    - Custom game list screen; create game form (name, rules); create custom debt form (debtor, creditor, reason)
    - _Requirements: 5.1, 5.3, 5.4, 5.5_

  - [ ]* 10.4 Write property test for custom game availability and uniqueness (Property 17)
    - **Property 17: Custom game availability and uniqueness**
    - **Validates: Requirements 5.2, 5.4, 5.5**
    - `// Feature: social-slap-tracker, Property 17: Created game appears in list; duplicate name fails`

- [ ] 11. Implement Read In mechanic
  - [ ] 11.1 Implement `confirmReadIn` AppSync mutation resolver
    - Write `isReadIn: true`, `readInConfirmedAt` on `MEMBER` item using conditional expression that prevents unsetting (`attribute_not_exists(isReadIn) OR isReadIn = :false`)
    - _Requirements: 8.1, 8.2, 8.3, 8.11_

  - [ ] 11.2 Implement `setReadInGameName` AppSync mutation resolver
    - Check caller is in `adminIds` or is `creatorId`; update `readInGameName` on group metadata; return `PERMISSION_DENIED` if not authorized
    - _Requirements: 8.5, 8.6_

  - [ ] 11.3 Implement `getReadInPlayers` AppSync query
    - Query `GROUP#<groupId> / MEMBER#*` items filtered by `isReadIn = true`
    - _Requirements: 8.4_

  - [ ] 11.4 Implement Read In access gating in AppSync resolvers
    - Add pipeline resolver step that checks `isReadIn` for the calling player before returning Read In game data, debts, or rules; return `ACCESS_DENIED` with no details if not read-in
    - Enforce `isReadIn = true` for both debtor and creditor on Read In debt creation
    - _Requirements: 8.7, 8.8, 8.9, 8.10, 9.10, 9.11_

  - [ ] 11.5 Build Read In screens
    - Read In prompt modal with confirmation button
    - Read In player list within group
    - Read In game name setting (admin only)
    - Read In game rules display (read-in players only)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 9.9, 9.10, 9.11_

  - [ ]* 11.6 Write property test for read-in status is permanent (Property 21)
    - **Property 21: Read-in status is permanent**
    - **Validates: Requirements 8.11**
    - `// Feature: social-slap-tracker, Property 21: No operation can set isReadIn back to false once confirmed`

  - [ ]* 11.7 Write property test for read-in access gating (Property 22)
    - **Property 22: Read-in access gating**
    - **Validates: Requirements 8.7, 8.8, 8.9, 8.10, 9.10, 9.11**
    - `// Feature: social-slap-tracker, Property 22: Non-read-in access denied; read-in debt with non-read-in party fails`

  - [ ]* 11.8 Write property test for read-in game name admin-only (Property 23)
    - **Property 23: Read-in game name admin-only**
    - **Validates: Requirements 8.5, 8.6**
    - `// Feature: social-slap-tracker, Property 23: Non-admin attempt to set read-in game name must fail`

- [ ] 12. Implement Read In game mechanics (chug events)
  - [ ] 12.1 Implement `recordGameCall` Lambda function
    - Validate caller is read-in; write `CHUG#<eventId>` item with `callerId`, `chuggedPlayerIds`, `createdAt`; write `FEED#<timestamp>#<entryId>` item with `type: "chug_event"`, `readInOnly: true`; dispatch SNS notification
    - No `SlapDebt` item created
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ] 12.2 Implement `getChugEvents` AppSync query
    - Query `GROUP#<groupId> / CHUG#*` items; wire subscription; resolver filters details based on caller's `isReadIn` status
    - _Requirements: 9.7, 9.8_

  - [ ] 12.3 Build game call screen
    - Read-in player picker for chug recipients; permanent mark toggle; submit button
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 12.4 Write property test for chug event correctness (Property 24)
    - **Property 24: Chug event correctness**
    - **Validates: Requirements 9.3, 9.4, 9.5**
    - `// Feature: social-slap-tracker, Property 24: Permanent-mark caller in chuggedPlayerIds; no debt created`

  - [ ]* 12.5 Write property test for chug event visibility gating (Property 25)
    - **Property 25: Chug event visibility gating**
    - **Validates: Requirements 9.6, 9.7, 9.8, 10.6**
    - `// Feature: social-slap-tracker, Property 25: Read-in player sees full details; non-read-in sees only indicator`

- [ ] 13. Checkpoint — ensure all tests pass, ask the user if questions arise.

- [ ] 14. Implement group feed
  - [ ] 14.1 Implement feed entry writes in existing Lambda resolvers
    - Add feed entry writes (`FEED#<timestamp>#<entryId>`) to: `createChallenge` (manchester_created), resolution Lambda (manchester_resolved), `createDebt` custom (custom_debt_created), custom debt resolution (custom_debt_resolved)
    - Chug event feed entry already written in task 12.1
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ] 14.2 Implement `getFeed` AppSync query and resolver
    - Query `GROUP#<groupId> / FEED#*` items sorted by SK (chronological); pipeline resolver checks `isReadIn` for caller and filters `readInOnly: true` entries to show full details vs. indicator only
    - Wire AppSync subscription for real-time feed updates
    - _Requirements: 10.1, 10.6_

  - [ ] 14.3 Build group feed screen
    - Chronological feed list with event type icons; chug event entries show full details to read-in players and generic indicator to others
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [ ]* 14.4 Write property test for feed completeness and ordering (Property 26)
    - **Property 26: Feed completeness and ordering**
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**
    - `// Feature: social-slap-tracker, Property 26: Feed contains all N events in chronological order`

- [ ] 15. Implement notifications
  - [ ] 15.1 Implement `NotificationService` — device token registration
    - Register device token with Amazon Pinpoint via Amplify SDK; store `pinpointEndpointId` on player profile
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ] 15.2 Implement Lambda notification dispatcher
    - Called from debt creation/resolution Lambdas and `recordGameCall`; checks `pushEnabled` on player profile; if true, publish to SNS topic → Pinpoint push; if false, write `NOTIF#<notifId>` inbox item to DynamoDB
    - Also dispatches read-in notifications to existing read-in players when a new player is read in (task 11.1)
    - _Requirements: 6.1, 6.2, 6.3, 8.12, 8.13_

  - [ ] 15.3 Implement `getInboxNotifications` AppSync query and `markRead` mutation
    - Query `PLAYER#<playerId> / NOTIF#*` items; `markRead` sets `read: true`; wire subscription
    - _Requirements: 6.3, 8.13_

  - [ ] 15.4 Build notification inbox screen
    - List of unread and read notifications; mark-as-read on tap
    - _Requirements: 6.3, 8.13_

  - [ ]* 15.5 Write property test for notification delivery (Property 18)
    - **Property 18: Notification delivery**
    - **Validates: Requirements 6.1, 6.2, 6.3, 8.12, 8.13**
    - `// Feature: social-slap-tracker, Property 18: Player receives push (SNS mock) or inbox notification — never neither`

- [ ] 16. Implement leave group and debt voiding
  - [ ] 16.1 Implement `leaveGroup` Lambda function
    - Delete `MEMBER#<playerId>` item; query all debts for player in group (GSI3); for each debt with `status: "pending"` or `"resolved"` (not `"delivered"`), update to `status: "voided"`, `shameStatus: true`, `voidReason: "Player <username> left the group"`, `voidedAt`; retain items in table
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 16.2 Build leave group UI
    - Leave group button in group settings with confirmation dialog
    - Voided debts visible in ledger with shame indicator
    - _Requirements: 11.1, 11.4_

  - [ ]* 16.3 Write property test for leave group voids outstanding debts (Property 27)
    - **Property 27: Leave group voids outstanding debts**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.5**
    - `// Feature: social-slap-tracker, Property 27: All pending/resolved debts voided with shame status; remain in ledger`

- [ ] 17. Implement Infinity Grog
  - [ ] 17.1 Implement `setupGrog` and `editGrogContents` Lambda functions
    - `setupGrog`: admin-only; validate all liquors have ABV ≥ 40% (return `INVALID_ABV` otherwise); write `GROUP#<groupId> / GROG#CURRENT` item; write `GROG_EDIT#<editId>` item as initial setup record; publish feed entry
    - `editGrogContents`: admin-only; validate ABV ≥ 40% for all entries; update `GROG#CURRENT` item; write `GROG_EDIT#<editId>` item capturing previous and new contents; publish feed entry
    - _Requirements: 12.1, 12.2, 12.3, 12.13, 12.14, 12.15_

  - [ ] 17.2 Implement `initiateGrogShot` and `confirmGrogShot` Lambda functions
    - `initiateGrogShot`: validate group has active grog; validate debt is `status: "resolved"` and debtor is caller; write `GROG_SHOT#<eventId>` item with `debtorConfirmed: true`
    - `confirmGrogShot`: validate caller is creditor; set `creditorConfirmed: true`, `confirmedAt`; update debt `status: "delivered"`, record `deliveredViaGrog: true`; publish feed entry
    - Both follow the same two-party conditional DynamoDB write pattern as `confirmDelivery`
    - _Requirements: 12.4, 12.5, 12.6, 12.10, 12.15_

  - [ ] 17.3 Implement `recordGrogReplacement` AppSync mutation resolver
    - Validate caller is the debtor on the confirmed shot; validate replacement ABV ≥ 40%; update `GROG#CURRENT` contents (swap consumed liquor for replacement); update `GROG_SHOT` item with `replacementLiquor` and `replacementAbv`
    - _Requirements: 12.7, 12.8, 12.9, 12.10_

  - [ ] 17.4 Implement `getGrog` and `getGrogTimeline` AppSync queries
    - `getGrog`: `GetItem` on `GROUP#<groupId> / GROG#CURRENT`; wire subscription
    - `getGrogTimeline`: query `GROUP#<groupId> / GROG_SHOT#*` and `GROUP#<groupId> / GROG_EDIT#*`; merge and sort by `createdAt`
    - _Requirements: 12.11, 12.12_

  - [ ] 17.5 Build Infinity Grog screens
    - Grog setup screen (admin only): initial liquor list with ABV fields
    - Grog detail screen: current contents, "Take a shot" action on eligible debts
    - Shot confirmation flow: debtor initiates, creditor confirms, debtor records replacement
    - Grog timeline screen: chronological list of shots and admin edits
    - Admin edit screen: edit current contents with ABV validation
    - _Requirements: 12.1, 12.2, 12.4, 12.7, 12.11, 12.12, 12.13_

  - [ ] 17.6 Build Skull Visualizer component
    - SVG skull-shaped path using `react-native-svg`; stacked segments clipped to skull shape, each proportional to liquor's share of total bottle contents
    - Assign deterministic per-liquor colours (hash liquor name to a palette)
    - Label each segment with liquor name and percentage
    - Animate segment transitions with `react-native-reanimated` (~400ms ease) when contents change
    - Timeline scrubber: horizontal scroll of events beneath the skull; selecting an event reconstructs bottle state client-side (replay from initial setup through all shots/edits up to that point) and updates the visualizer without a network call
    - _Requirements: 12.16, 12.17, 12.18, 12.19_

  - [ ]* 17.6 Write property test for Infinity Grog ABV enforcement (Property 28)
    - **Property 28: Infinity Grog ABV enforcement**
    - **Validates: Requirements 12.3, 12.9, 12.14**
    - `// Feature: social-slap-tracker, Property 28: Any liquor with ABV < 40% rejected; grog contents unchanged`

  - [ ]* 17.7 Write property test for grog shot two-party confirmation (Property 29)
    - **Property 29: Grog shot two-party confirmation**
    - **Validates: Requirements 12.5, 12.6**
    - `// Feature: social-slap-tracker, Property 29: Single confirmation must not mark debt as delivered`

  - [ ]* 17.8 Write property test for grog timeline completeness (Property 30)
    - **Property 30: Grog timeline completeness**
    - **Validates: Requirements 12.11, 12.13**
    - `// Feature: social-slap-tracker, Property 30: Timeline contains all N shots and M admin edits in chronological order`

  - [ ]* 17.9 Write property test for grog setup is admin-only (Property 31)
    - **Property 31: Grog setup is admin-only**
    - **Validates: Requirements 12.1, 12.13**
    - `// Feature: social-slap-tracker, Property 31: Non-admin grog setup or edit must fail`

  - [ ]* 17.10 Write property test for Skull Visualizer segment proportions (Property 32)
    - **Property 32: Skull Visualizer segment proportions**
    - **Validates: Requirements 12.16, 12.17**
    - `// Feature: social-slap-tracker, Property 32: N liquors render N segments; proportions sum to 1.0`

  - [ ]* 17.11 Write property test for timeline scrubber state reconstruction (Property 33)
    - **Property 33: Timeline scrubber state reconstruction**
    - **Validates: Requirements 12.19**
    - `// Feature: social-slap-tracker, Property 33: Replaying events to any timeline point produces correct bottle contents`

- [ ] 18. Implement offline support and data persistence
  - [ ] 18.1 Configure Amplify DataStore conflict resolution and offline banner
    - Set conflict resolution strategy to `AUTO_MERGE` in DataStore config
    - Add network state listener; display stale-data banner when offline
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ] 18.2 Verify DataStore queues and syncs writes on reconnect
    - Ensure all mutations go through DataStore so they are queued offline and flushed on reconnect via AppSync delta sync
    - _Requirements: 7.4_

  - [ ]* 18.3 Write property test for data persistence round-trip (Property 19)
    - **Property 19: Data persistence round-trip**
    - **Validates: Requirements 7.1**
    - `// Feature: social-slap-tracker, Property 19: Entity written via AppSync mutation reads back as equivalent record`

  - [ ]* 18.4 Write property test for offline sync on reconnect (Property 20)
    - **Property 20: Offline sync on reconnect**
    - **Validates: Requirements 7.4**
    - `// Feature: social-slap-tracker, Property 20: Write queued offline is applied to DynamoDB on reconnect`

- [ ] 19. Final checkpoint — ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check with a minimum of 100 iterations per test
- Lambda functions use exponential backoff with jitter for DynamoDB throttling
- AppSync resolvers use VTL pipeline resolvers; multi-step atomic operations use Lambda resolvers with DynamoDB conditional writes

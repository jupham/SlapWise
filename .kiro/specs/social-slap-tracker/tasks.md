# Implementation Plan: Social Slap Tracker

## Overview

Incremental implementation of the Social Slap Tracker React Native app. Infrastructure is provisioned via AWS CDK (TypeScript) in a dedicated `infrastructure/` directory (a standalone CDK project alongside the React Native `app/` directory). The React Native client uses the Amplify SDK (auth, AppSync, Pinpoint) configured manually via `Amplify.configure()` using values from CDK stack outputs — no Amplify CLI is used. Tasks build from infrastructure setup through authentication, group management, game mechanics, notifications, and feed — wiring everything together at the end.

## Tasks

- [x] 1. Set up project structure, CDK infrastructure, and core TypeScript types
  - [x] 1.1 Write CDK stacks in `infrastructure/`
    - _Requirements: 0.1, 1.1, 1.2, 1.3, 6.1, 7.1_

- [x] 2. Implement authentication module
  - [x] 2.1 Implement Cognito pre-sign-up Lambda trigger for username uniqueness
    - _Requirements: 0.3_
  - [x] 2.2 Implement Cognito post-confirmation Lambda trigger
    - _Requirements: 0.1, 0.7_
  - [x] 2.3 Implement `AuthService` (register, login, logout, currentPlayer)
    - _Requirements: 0.1, 0.2, 0.4, 0.5, 0.6_
  - [x] 2.4 Build registration and login screens
    - _Requirements: 0.1, 0.2, 0.3, 0.4, 0.5_

- [x] 3. Implement group management
  - [x] 3.1 Implement `createGroup` Lambda function
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 3.2 Implement `joinGroup` Lambda function
    - _Requirements: 1.4, 1.5_
  - [x] 3.3 Implement AppSync resolvers for `getGroups` and `getGroupMembers`
    - _Requirements: 1.6, 1.7_
  - [x] 3.4 Implement `designateAdmin` AppSync mutation resolver
    - _Requirements: 1.8, 1.9_
  - [x] 3.5 Implement `regenerateInviteCode` mutation
    - _Requirements: 1.3_
  - [x] 3.6 Build group list, group detail, and invite screens
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 4. Implement Manchester challenge creation and resolution
  - [x] 4.1 Implement `createChallenge` AppSync mutation and resolver
    - _Requirements: 2.1, 2.2, 2.3, 2.5_
  - [x] 4.2 Implement `getPendingDebts` AppSync query
    - _Requirements: 2.4_
  - [x] 4.3 Build Manchester challenge creation screen
    - _Requirements: 2.1, 2.2, 2.4, 2.5_
  - [x] 4.4 Implement `submitResolutionConfirmation` Lambda resolver
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10_
  - [x] 4.5 Build resolution confirmation screen
    - _Requirements: 3.1, 3.2, 3.3, 3.7_

- [x] 5. Implement slap debt ledger and delivery confirmation
  - [x] 5.1 Implement `getDebts` AppSync query with filters
    - _Requirements: 4.1, 4.5_
  - [x] 5.2 Implement `getNetSummary` AppSync resolver
    - _Requirements: 4.2, 4.4_
  - [x] 5.3 Implement `confirmDelivery` Lambda resolver
    - _Requirements: 4.3, 4.4_
  - [x] 5.4 Build ledger screen with filter controls and net summary
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Implement Read In mechanic
  - [x] 6.1 Implement `confirmReadIn` AppSync mutation resolver
    - Write `isReadIn: true`, `readInConfirmedAt` on `MEMBER` item using conditional expression that prevents unsetting (`attribute_not_exists(isReadIn) OR isReadIn = :false`)
    - _Requirements: 8.1, 8.2, 8.3, 8.11_

  - [x] 6.2 Implement `setReadInGameName` AppSync mutation resolver
    - Check caller is in `adminIds` or is `creatorId`; update `readInGameName` on group metadata; return `PERMISSION_DENIED` if not authorized
    - _Requirements: 8.5, 8.6_

  - [x] 6.3 Implement `getReadInPlayers` AppSync query
    - Query `GROUP#<groupId> / MEMBER#*` items filtered by `isReadIn = true`
    - _Requirements: 8.4_

  - [x] 6.4 Build Read In screens
    - Read In prompt modal with confirmation button ("By checking this, you permanently and irrevocably agree to abide by the rules of this game even if you don't know what they are. This cannot be undone.")
    - Read In player list within group detail
    - Read In game name setting (admin only)
    - Read In game rules display (read-in players only)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 9.9, 9.10, 9.11_

  - [ ]* 6.5 Write property test for read-in status is permanent (Property 21)
    - **Property 21: Read-in status is permanent**
    - **Validates: Requirements 8.11**
    - `// Feature: social-slap-tracker, Property 21: No operation can set isReadIn back to false once confirmed`

  - [ ]* 6.6 Write property test for read-in game name admin-only (Property 23)
    - **Property 23: Read-in game name admin-only**
    - **Validates: Requirements 8.5, 8.6**
    - `// Feature: social-slap-tracker, Property 23: Non-admin attempt to set read-in game name must fail`

- [ ] 7. Implement Read In game mechanics (chug events)
  - [ ] 7.1 Implement `recordGameCall` Lambda function
    - Validate caller is read-in; write `CHUG#<eventId>` item with `callerId`, `chuggedPlayerIds`, `createdAt`; write `FEED#<timestamp>#<entryId>` item with `type: "chug_event"`, `readInOnly: true`; dispatch push notification to group
    - No `SlapDebt` item created
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [ ] 7.2 Implement `getChugEvents` AppSync query
    - Query `GROUP#<groupId> / CHUG#*` items; resolver filters details based on caller's `isReadIn` status
    - _Requirements: 9.7, 9.8_

  - [ ] 7.3 Build game call screen
    - Read-in player picker for chug recipients; permanent mark toggle; submit button
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [ ]* 7.4 Write property test for chug event correctness (Property 24)
    - **Property 24: Chug event correctness**
    - **Validates: Requirements 9.3, 9.4, 9.5**
    - `// Feature: social-slap-tracker, Property 24: Permanent-mark caller in chuggedPlayerIds; no debt created`

  - [ ]* 7.5 Write property test for chug event visibility gating (Property 25)
    - **Property 25: Chug event visibility gating**
    - **Validates: Requirements 9.6, 9.7, 9.8, 10.6**
    - `// Feature: social-slap-tracker, Property 25: Read-in player sees full details; non-read-in sees only indicator`

- [ ] 8. Implement group feed
  - [ ] 8.1 Implement feed entry writes in existing Lambda resolvers
    - Add feed entry writes (`FEED#<timestamp>#<entryId>`) to: `createChallenge` (manchester_created), resolution Lambda (manchester_resolved)
    - Chug event feed entry already written in task 7.1
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ] 8.2 Implement `getFeed` AppSync query and resolver
    - Query `GROUP#<groupId> / FEED#*` items sorted by SK (chronological); pipeline resolver checks `isReadIn` for caller and filters `readInOnly: true` entries to show full details vs. indicator only
    - _Requirements: 10.1, 10.6_

  - [ ] 8.3 Build group feed screen
    - Chronological feed list with event type icons; chug event entries show full details to read-in players and generic indicator to others
    - _Requirements: 10.1, 10.2, 10.3, 10.6_

  - [ ]* 8.4 Write property test for feed completeness and ordering (Property 26)
    - **Property 26: Feed completeness and ordering**
    - **Validates: Requirements 10.1, 10.2, 10.3**
    - `// Feature: social-slap-tracker, Property 26: Feed contains all N events in chronological order`

- [ ] 9. Implement push notifications
  - [ ] 9.1 Implement `NotificationService` — device token registration
    - Register device token with Amazon Pinpoint via Amplify SDK; store `pinpointEndpointId` on player profile
    - _Requirements: 6.1, 6.2_

  - [ ] 9.2 Implement Lambda notification dispatcher
    - Called from debt creation/resolution Lambdas and `recordGameCall`; sends Pinpoint push to relevant players
    - Also dispatches read-in notifications to existing read-in players when a new player is read in (task 6.1)
    - _Requirements: 6.1, 6.2, 8.12_

- [ ] 10. Implement leave group and debt voiding
  - [ ] 10.1 Implement `leaveGroup` Lambda function
    - Delete `MEMBER#<playerId>` item; query all debts for player in group (GSI4); for each debt with `status: "pending"` or `"resolved"` (not `"delivered"`), hard-delete the DEBT item and both PLAYERDEBT items via TransactWrite
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 10.2 Build leave group UI
    - Leave group button in group settings with confirmation dialog
    - _Requirements: 11.1_

- [ ] 11. Final checkpoint — ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use fast-check with a minimum of 100 iterations per test
- Lambda functions use exponential backoff with jitter for DynamoDB throttling
- Infinity Grog is fully implemented in the `infinity-grog` and `grog-shot-delivery-flow` specs

# SlapWise — DynamoDB Data Model & Access Patterns

## Single-Table Design

Table name: `SlapTracker`  
Primary key: `PK` (partition) + `SK` (sort)

---

## Item Types

### PLAYER profile
Written by `post-confirmation` Lambda on Cognito sign-up.

| Attribute | Value |
|-----------|-------|
| PK | `PLAYER#<playerId>` |
| SK | `PROFILE` |
| playerId | UUID (Cognito sub) |
| username | string |
| email | string |
| createdAt | ISO8601 |
| GSI1PK | `PLAYER#<playerId>` |
| GSI1SK | `PROFILE` |

---

### GROUP metadata
Written by `create-group` Lambda.

| Attribute | Value |
|-----------|-------|
| PK | `GROUP#<groupId>` |
| SK | `METADATA` |
| groupId | UUID |
| name | string |
| creatorId | playerId |
| adminIds | string set |
| inviteCode | string |
| readInGameName | string \| null |
| createdAt | ISO8601 |

---

### MEMBER record
Written by `join-group` Lambda. One item per player per group.

| Attribute | Value |
|-----------|-------|
| PK | `GROUP#<groupId>` |
| SK | `MEMBER#<playerId>` |
| playerId | UUID |
| groupId | UUID |
| username | string |
| joinedAt | ISO8601 |
| isReadIn | boolean |
| readInConfirmedAt | ISO8601 \| null |
| GSI1PK | `PLAYER#<playerId>` |
| GSI1SK | `GROUP#<groupId>` |

GSI1 answers "what groups is this player in?"

---

### INVITE lookup
Written by `create-group` and `regenerate-invite-code` Lambdas.

| Attribute | Value |
|-----------|-------|
| PK | `INVITE#<code>` |
| SK | `LOOKUP` |
| groupId | UUID |
| active | boolean |
| TTL | epoch seconds (auto-expire old codes) |

---

### DEBT item
Written by `create-challenge` Lambda.

| Attribute | Value |
|-----------|-------|
| PK | `GROUP#<groupId>` |
| SK | `DEBT#<debtId>` |
| debtId | UUID |
| groupId | UUID |
| gameType | `manchester` \| `read_in` |
| status | `pending` \| `pending_confirmation` \| `resolved` \| `delivered` |
| challengerId | playerId |
| statementMakerId | playerId |
| statement | string |
| debtorId | playerId \| null (set on resolution) |
| creditorId | playerId \| null (set on resolution) |
| debtPunishment | `slap` \| `infinity_grog` \| null (set on resolution) |
| challengerConfirmation | map \| null |
| statementMakerConfirmation | map \| null |
| debtorDeliveryConfirmed | boolean |
| creditorDeliveryConfirmed | boolean |
| createdAt | ISO8601 |
| resolvedAt | ISO8601 \| null |
| deliveredAt | ISO8601 \| null |
| GSI2PK | `GROUP#<groupId>#STATUS#<status>` |
| GSI2SK | `DEBT#<createdAt>#<debtId>` |

**Debt lifecycle:** `pending` → `pending_confirmation` → `resolved` → `delivered`

**Void/deletion:** Voided debts are hard-deleted (DEBT item + both PLAYERDEBT items, TransactWrite). No soft delete, no voided status.

---

### PLAYER-DEBT index item (GSI4 fan-out)
Written atomically with the DEBT item via `TransactWrite`. One item per involved player. Denormalized so My Slate can render cards from a single GSI4 query with no second fetch.

| Attribute | Value |
|-----------|-------|
| PK | `PLAYERDEBT#<playerId>#GROUP#<groupId>` |
| SK | `DEBT#<createdAt>#<debtId>` |
| GSI4PK | `PLAYER#<playerId>#GROUP#<groupId>` |
| GSI4SK | `DEBT#<createdAt>#<debtId>` |
| debtId | UUID |
| groupId | UUID |
| playerId | UUID |
| role | `challenger` \| `statementMaker` |
| status | mirrors DEBT status — updated on every transition |
| gameType | `manchester` \| `read_in` |
| statement | string — denormalized |
| challengerId | UUID — denormalized |
| statementMakerId | UUID — denormalized |
| debtorId | UUID \| null — denormalized, set on resolution |
| creditorId | UUID \| null — denormalized, set on resolution |
| debtPunishment | `slap` \| `infinity_grog` \| null — denormalized, set on resolution |
| createdAt | ISO8601 |

---

### FEED entry
Written by Lambdas on each event. Immutable once written.

| Attribute | Value |
|-----------|-------|
| PK | `GROUP#<groupId>` |
| SK | `FEED#<createdAt>#<entryId>` |
| entryId | UUID |
| groupId | UUID |
| type | see Feed Event Types below |
| refId | debtId \| eventId — used to navigate to detail |
| actorId | playerId who triggered the event |
| summary | human-readable string for non-read-in members (or all members for non-read-in events) |
| readInOnly | boolean — if true, non-read-in members see redacted summary |
| createdAt | ISO8601 |

**Feed Event Types:**
- `manchester_created` — refId = debtId
- `manchester_resolved` — refId = debtId
- `slap_delivered` — refId = debtId
- `chug_event` — refId = chugEventId
- `member_joined` — refId = playerId

---

### CHUG event
Written by `record-game-call` Lambda.

| Attribute | Value |
|-----------|-------|
| PK | `GROUP#<groupId>` |
| SK | `CHUG#<createdAt>#<eventId>` |
| eventId | UUID |
| groupId | UUID |
| callerId | playerId (who called game) |
| chuggedPlayerIds | string list (who had to drink) |
| createdAt | ISO8601 |

---

## Removed Item Types
- **NOTIFICATION** — no in-app inbox. Push notifications sent via Pinpoint directly from Lambdas.
- **CustomGame / custom debt** — out of scope for now.

---

## Global Secondary Indexes

| Index | PK | SK | Purpose |
|-------|----|----|---------|
| GSI1 | `PLAYER#<playerId>` | `GROUP#<groupId>` | Player's group list |
| GSI2 | `GROUP#<groupId>#STATUS#<status>` | `DEBT#<createdAt>#<debtId>` | Debts by group + status, sorted by time |
| GSI4 | `PLAYER#<playerId>#GROUP#<groupId>` | `DEBT#<createdAt>#<debtId>` | All debts a player is involved in within a group, sorted by time |

**GSI3 is dropped** — it only served custom debts which are removed. GSI4 covers all player-debt lookups.

---

## Access Patterns

| Screen / Operation | Query | Index | Notes |
|-------------------|-------|-------|-------|
| Group list | `GSI1PK = PLAYER#<sub>` | GSI1 | VTL |
| Group detail (members) | `PK = GROUP#<id>, SK begins_with MEMBER#` | main | VTL |
| Group detail (metadata) | `PK = GROUP#<id>, SK = METADATA` | main | GetItem |
| Join group by invite code | `PK = INVITE#<code>, SK = LOOKUP` | main | GetItem in Lambda |
| Group Feed | `PK = GROUP#<id>, SK begins_with FEED#` | main | VTL, scanIndexForward=false (newest first) |
| Feed event detail | `PK = GROUP#<id>, SK = DEBT#<id>` or `CHUG#<id>` | main | GetItem |
| My Slate | `GSI4PK = PLAYER#<sub>#GROUP#<id>` | GSI4 | Single query, full card data on index item |
| Resolution confirmation | `PK = GROUP#<id>, SK = DEBT#<id>` | main | GetItem in Lambda |
| Delivery confirmation | `PK = GROUP#<id>, SK = DEBT#<id>` | main | UpdateItem in Lambda |
| Void debt (admin) | `PK = GROUP#<id>, SK = DEBT#<id>` | main | DeleteItem + delete 2× PLAYERDEBT (TransactWrite) |

---

## Write Patterns

| Event | Items written / updated |
|-------|------------------------|
| Create challenge | DEBT + 2× PLAYERDEBT + FEED entry (TransactWrite) |
| Submit resolution (1st party) | Update DEBT (status→pending_confirmation, GSI2PK) + Update 2× PLAYERDEBT status |
| Submit resolution (2nd party) | Update DEBT (status→resolved, debtorId/creditorId/debtPunishment) + Update 2× PLAYERDEBT (status + resolution fields) + Write FEED entry |
| Confirm delivery (both confirmed) | Update DEBT (status→delivered) + Update 2× PLAYERDEBT status + Write FEED entry |
| Void debt | Delete DEBT + Delete 2× PLAYERDEBT (TransactWrite) |
| Record chug event | Write CHUG item + Write FEED entry |
| Create group | GROUP metadata + INVITE lookup |
| Join group | MEMBER item + Write FEED entry |
| Regenerate invite | New INVITE item (TTL old one) |

---

## Push Notification Triggers

| Event | Recipients |
|-------|-----------|
| Manchester created | Statement maker |
| Resolution confirmation needed (other party submitted) | Player who hasn't submitted yet |
| Debt resolved | Both involved players |
| Slap/grog delivered | Entire group |

---

## Key Design Notes

- **Sort keys include timestamps** so queries return items in chronological order without client-side sorting.
- **GSI4 items are denormalized** — enough fields to render My Slate cards without a second fetch. Write complexity is the tradeoff.
- **GSI2PK must be updated** on every status change (it encodes status in the key). This is unavoidable with this design and is acceptable at this scale.
- **Voided debts are hard-deleted** — no voided status, no soft delete. Simplifies queries and My Slate logic.
- **Feed entries are immutable** — written once, never updated. The feed is an event log, not a live state view.
- **FEED entry for delivery** is written only when *both* parties have confirmed, not on each individual confirmation.

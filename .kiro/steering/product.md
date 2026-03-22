# Product: SlapWise (Social Slap Tracker)

SlapWise is a mobile app for tracking social drinking game debts ("slaps") among friend groups. Players form groups, record debts from games like "Manchester", confirm delivery of slaps, and view a live group feed and personal slate of activity.

## Core Concepts

- **Player**: A registered user with an account
- **Group**: A friend group with an invite code; members can be admins or "read in"
- **SlapDebt**: A debt record between a debtor and creditor, with lifecycle: `pending` → `pending_confirmation` → `resolved` → `delivered`
- **Manchester**: The primary game type — one player makes a statement, another calls Manchester on it, triggering a debt
- **Read In**: A special group status unlocking the Read In game. Read In events are visible to all members but details are hidden from non-read-in members (shown as "A read in challenge was issued")
- **Chug Event**: A group-wide drinking call — caller picks who called game and who had to drink. Recorded for history, no confirmation required
- **Group Feed**: Chronological activity log for a group. All members see all events; read-in events show redacted summaries to non-read-in members
- **My Slate**: Personal view showing everything a player is involved in — what needs action, what's waiting, outstanding punishments, and history

## Screens

### Group Feed
- Chronological list of all events in a group (newest first or oldest first TBD)
- Event types: manchester_created, manchester_resolved, slap_delivered, chug_event, member_joined
- Read In events show full details to read-in members, redacted summary to others
- Tapping an event navigates to a detail view
- If you're involved in the event, the detail view shows appropriate actions

### My Slate
Sections:
1. **Needs Action** — debts where it's your turn (submit resolution confirmation, confirm delivery of a slap you received)
2. **Waiting** — debts you're involved in but waiting on the other party
3. **Outstanding Punishments** — resolved debts where slap/grog hasn't been delivered yet (both owed by you and owed to you)
4. **History** — all delivered debts you were involved in

### Group Detail
- Member list
- Invite code + share
- Navigation to Feed and My Slate

## Void / Deletion Rules
- Voided debts are **deleted** from the database (no soft delete, no voided status)
- An admin can void (delete) any debt at any time
- Both players in a Manchester can mutually agree to void — if both select "void" during resolution, the debt is deleted
- When a debt is deleted, the DEBT item and both PLAYERDEBT index items are removed (TransactWrite)

## Push Notifications
Sent via Pinpoint. No in-app notification inbox — My Slate covers pending items.

| Trigger | Recipients |
|---------|-----------|
| Manchester created | Statement maker (you've been called out) |
| Resolution confirmation needed (other party submitted theirs) | The player who hasn't submitted yet |
| Debt resolved | Both involved players (tells them who owes what punishment) |
| Slap/grog delivered | Entire group |

No push for: chug events, member joined, admin actions.

## What's Out of Scope (for now)
- Custom games / custom debts
- In-app notification inbox screen
- Net summary / leaderboard screen (easy to add later via existing GSI2 query)
- Disputed status (removed — second party must agree with first party's outcome)

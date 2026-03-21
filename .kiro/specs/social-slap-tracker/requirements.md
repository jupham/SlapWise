# Requirements Document

## Introduction

A mobile app for tracking silly social games among friends. The primary game is "Manchester": when someone makes a declarative statement, another person can call "Manchester" on it. If the statement-maker follows through, they get to slap the caller; if they don't, the caller gets to slap them. The app tracks pending and resolved slap debts across Manchester and other custom social games.

## Glossary

- **App**: The mobile social slap tracking application
- **Player**: A registered user of the App
- **Group**: A named collection of Players who play social games together
- **Group_Creator**: The Player who originally created a Group; the Group_Creator is a Group_Admin by default and retains that status permanently
- **Group_Admin**: A Player within a Group who has been designated by the Group_Creator as an administrator; Group_Admins share elevated management permissions within the Group
- **Manchester**: A social game where a Player challenges another Player's declarative statement, resulting in a pending slap debt
- **Statement**: A declarative claim made by a Player that can be challenged via Manchester
- **Challenge**: The act of calling "Manchester" on a Statement
- **Slap_Debt**: A record indicating that one Player owes another Player a slap, along with the reason and originating game
- **Challenger**: The Player who calls Manchester on a Statement
- **Statement_Maker**: The Player who made the original Statement
- **Custom_Game**: A user-defined social game with its own rules for creating and resolving Slap_Debts
- **Resolution**: The act of marking a Slap_Debt as fulfilled or voided
- **Voided_Debt**: A Slap_Debt that has been cancelled due to a Player leaving the Group; marked with a "shame" status and retained in the ledger as a historical record
- **Read_In**: A per-Group opt-in membership status for a Player, granting access to the Read_In_Game within that Group; once confirmed, this status is permanent and irrevocable — a Player cannot opt out or have their Read_In status removed
- **Read_In_Game**: A gated Custom_Game within a Group, accessible only to Players who are Read_In for that Group; its name is configured by the Group_Creator or a Group_Admin
- **Read_In_Prompt**: The warning message displayed to a Player before they confirm their Read_In status, informing them they agree to abide by the rules of the game
- **Game_Call**: The in-person act of a Read_In Player declaring "Game" within a Group, triggering the Read_In_Game penalty mechanic
- **Chug_Event**: A recorded instance of a Game_Call, capturing the caller, the Players who received the chug punishment, and the timestamp; no Slap_Debt is created
- **Permanent_Mark**: A mark on a Player's drink that exempts that Player from the chug penalty when a Game_Call is made against them, causing the caller to chug instead
- **Group_Feed**: The chronological activity stream visible to all members of a Group, showing game events including Manchester Slap_Debt creation and resolution, Custom_Game Slap_Debt creation and resolution, Chug_Events, and Infinity_Grog events; Chug_Event details are gated to Read_In Players only
- **Infinity_Grog**: An optional per-Group bottle containing a mix of liquors (each at least 40% ABV), used as an alternative to a slap for settling a Slap_Debt; set up and managed by Group_Admins
- **Grog_Shot**: A recorded instance of a Player taking a shot from the Infinity_Grog to settle a Slap_Debt, capturing the Player, the debt settled, the liquor consumed, the replacement liquor chosen, and the timestamp
- **Grog_Timeline**: The chronological history of all Grog_Shots and admin edits to the Infinity_Grog, showing how the bottle's contents have evolved over time
- **Skull_Visualizer**: The skull-shaped graphic on the Infinity_Grog screen that displays the current (or historical) bottle contents as proportionally-sized, colour-coded segments per liquor, with animated transitions when contents change

---

## Requirements

### Requirement 0: Player Authentication

**User Story:** As a person, I want to register an account and log in, so that my identity is tracked consistently across groups and games.

#### Acceptance Criteria

1. THE App SHALL allow a new user to register an account by providing a username, email address, and password.
2. IF a user attempts to register with an email address that is already associated with an existing account, THEN THE App SHALL display a descriptive error and prevent registration.
3. IF a user attempts to register with a username that is already taken, THEN THE App SHALL display a descriptive error and prevent registration.
4. WHEN a registered Player provides valid credentials, THE App SHALL authenticate that Player and grant access to the App.
5. IF a Player provides invalid credentials during login, THEN THE App SHALL display a descriptive error and deny access.
6. THE App SHALL allow an authenticated Player to log out, terminating their active session.
7. WHILE a Player is authenticated, THE App SHALL associate all actions taken by that Player (group membership, Slap_Debt attribution, Game_Calls) with that Player's account.

---

### Requirement 1: Player and Group Management

**User Story:** As a Player, I want to create a group and invite friends, so that we can track social games together.

#### Acceptance Criteria

1. THE App SHALL allow a Player to create a named Group.
2. WHEN a Player creates a Group, THE App SHALL designate that Player as the Group_Creator and Group_Admin for that Group.
3. WHEN a Player creates a Group, THE App SHALL generate a shareable invite code for that Group.
4. WHEN a Player submits a valid invite code, THE App SHALL add that Player to the corresponding Group.
5. IF a Player submits an invalid or expired invite code, THEN THE App SHALL display a descriptive error message.
6. THE App SHALL display a list of all Groups a Player belongs to.
7. THE App SHALL display the list of Players within a Group.
8. WHEN a Group_Creator designates another Player within the Group as a Group_Admin, THE App SHALL grant that Player Group_Admin permissions for that Group.
9. IF a Player who is not the Group_Creator attempts to designate a Group_Admin, THEN THE App SHALL deny the action and display an error.

---

### Requirement 2: Recording a Manchester Challenge

**User Story:** As a Player, I want to call Manchester on a friend's statement, so that we can track whether they follow through.

#### Acceptance Criteria

1. WHEN a Player initiates a Manchester Challenge within a Group, THE App SHALL prompt the Player to select the Statement_Maker and enter the text of the Statement.
2. IF a Player attempts to select themselves as the Statement_Maker when initiating a Manchester Challenge, THEN THE App SHALL display a validation error and prevent submission.
3. WHEN a Manchester Challenge is submitted, THE App SHALL create a Slap_Debt record with status "pending", linking the Challenger, the Statement_Maker, and the Statement text.
4. THE App SHALL display all pending Manchester Slap_Debts within a Group, showing the Challenger, Statement_Maker, and Statement for each.
5. IF a Manchester Challenge is submitted without a selected Statement_Maker or Statement text, THEN THE App SHALL display a validation error and prevent submission.

---

### Requirement 3: Resolving a Manchester Challenge

**User Story:** As a Player, I want to mark a Manchester challenge as resolved, so that the correct person is recorded as owed a slap.

#### Acceptance Criteria

1. THE App SHALL restrict submission of a Resolution confirmation for a Slap_Debt to the Challenger and the Statement_Maker involved in that specific Slap_Debt.
2. WHEN resolving a pending Manchester Slap_Debt, THE App SHALL require both the Challenger and the Statement_Maker to independently submit their confirmation of the outcome before the Slap_Debt is considered resolved.
3. WHEN the Challenger submits their confirmation, THE App SHALL record the Challenger's stated outcome and set the Slap_Debt to a "pending confirmation" state until the Statement_Maker also confirms.
4. WHEN the Statement_Maker submits their confirmation, THE App SHALL record the Statement_Maker's stated outcome.
5. WHEN both the Challenger and the Statement_Maker have submitted their confirmations and both agree the Statement was followed through, THE App SHALL update the Slap_Debt to indicate the Challenger owes the Statement_Maker a slap and set the status to "resolved".
6. WHEN both the Challenger and the Statement_Maker have submitted their confirmations and both agree the Statement was not followed through, THE App SHALL update the Slap_Debt to indicate the Statement_Maker owes the Challenger a slap and set the status to "resolved".
7. WHEN both the Challenger and the Statement_Maker have submitted their confirmations but their stated outcomes disagree, THE App SHALL set the Slap_Debt status to "disputed" and flag it for manual review without auto-resolving.
8. WHEN a Slap_Debt is resolved, THE App SHALL record the timestamp of the Resolution.
9. THE App SHALL restrict Resolution confirmation of a Slap_Debt to Players who are members of the Group in which the Slap_Debt was created.
10. IF a Player attempts to submit a Resolution confirmation for a Slap_Debt that is already resolved or disputed, THEN THE App SHALL display an error and prevent the action.

---

### Requirement 4: Slap Debt Ledger

**User Story:** As a Player, I want to see who owes who a slap and why, so that debts are never forgotten.

#### Acceptance Criteria

1. THE App SHALL display a ledger of all resolved Slap_Debts within a Group, showing the debtor, creditor, reason, originating game, and resolution timestamp.
2. THE App SHALL display a summary per Player showing the net number of slaps owed to or from each other Player within a Group.
3. WHEN a Slap_Debt is to be marked as physically delivered (slap carried out), THE App SHALL require both the debtor and the creditor to independently confirm delivery before updating the Slap_Debt status to "delivered".
4. WHEN both the debtor and the creditor have confirmed delivery of a Slap_Debt, THE App SHALL update the Slap_Debt status to "delivered" and remove it from the outstanding debt summary.
5. THE App SHALL allow a Player to filter the ledger by game type, Player, or status (pending, resolved, delivered).

---

### Requirement 5: Custom Game Support

**User Story:** As a Player, I want to define and track custom social games beyond Manchester, so that any group game can be recorded in the app.

#### Acceptance Criteria

1. THE App SHALL allow a Player within a Group to create a Custom_Game with a name and a description of its rules.
2. WHEN a Custom_Game is created, THE App SHALL make it available for recording Slap_Debts within that Group.
3. WHEN a Player records a Slap_Debt under a Custom_Game, THE App SHALL prompt the Player to select the debtor, the creditor, and enter a free-text reason.
4. THE App SHALL display all Custom_Games defined within a Group.
5. IF a Player attempts to create a Custom_Game with a name that already exists within the Group, THEN THE App SHALL display an error and prevent the duplicate.

---

### Requirement 6: Notifications

**User Story:** As a Player, I want to be notified when I am involved in a new or resolved Slap_Debt, so that I stay aware of my obligations.

#### Acceptance Criteria

1. WHEN a Slap_Debt is created that involves a Player as either debtor or creditor, THE App SHALL send that Player a push notification describing the debt and its reason.
2. WHEN a Slap_Debt involving a Player is resolved, THE App SHALL send that Player a push notification indicating the outcome.
3. WHERE a Player has disabled push notifications, THE App SHALL display unread Slap_Debt events in an in-app notification inbox instead.

---

### Requirement 7: Data Persistence and Sync

**User Story:** As a Player, I want my game data to persist and stay in sync across devices, so that the ledger is always up to date for everyone in the group.

#### Acceptance Criteria

1. THE App SHALL persist all Group, Player, Slap_Debt, Custom_Game, Chug_Event, and Read_In status data to a remote backend.
2. WHEN a Slap_Debt is created or updated by any Player in a Group, THE App SHALL reflect the change for all other Players in that Group within 5 seconds under normal network conditions.
3. WHILE a Player's device has no network connectivity, THE App SHALL display the last known state of the Group data and indicate that the data may be stale.
4. WHEN network connectivity is restored, THE App SHALL synchronize any locally cached changes with the remote backend.

---

### Requirement 8: Read In Mechanic

**User Story:** As a Player, I want to opt in to a Group's secret gated game, so that I can participate in a special layer of the social game that only read-in members can access.

#### Acceptance Criteria

1. THE App SHALL support a Read_In status per Player per Group, independent of any other Group membership settings.
2. WHEN a Player chooses to mark themselves as Read_In within a Group, THE App SHALL display the Read_In_Prompt: "By checking this, you permanently and irrevocably agree to abide by the rules of this game even if you don't know what they are. This cannot be undone."
3. WHEN a Player confirms the Read_In_Prompt, THE App SHALL set that Player's Read_In status to active for that Group.
4. THE App SHALL allow Players within a Group to view which other Players in that Group are Read_In.
5. WHEN a Group is configured with a Read_In_Game, THE App SHALL allow only the Group_Creator or a Group_Admin to set or change the Read_In_Game's name.
6. IF a Player who is not the Group_Creator or a Group_Admin attempts to set or change the Read_In_Game's name, THEN THE App SHALL deny the action and display an error.
7. WHILE a Player's Read_In status is active for a Group, THE App SHALL grant that Player access to the Group's Read_In_Game.
8. WHEN a Read_In Player records a Slap_Debt under the Read_In_Game, THE App SHALL require both the debtor and the creditor to be Read_In Players within that Group.
9. IF a Player who is not Read_In attempts to view the Read_In_Game or its associated Slap_Debts, THEN THE App SHALL deny access and display no details about the Read_In_Game.
10. IF a Player attempts to create a Read_In_Game Slap_Debt involving a Player who is not Read_In, THEN THE App SHALL display a validation error and prevent submission.
11. THE App SHALL NOT provide any mechanism for a Player to revoke or remove their Read_In status once confirmed.
12. WHEN a Player's Read_In status is confirmed for a Group, THE App SHALL send a push notification to every other Player in that Group who is already Read_In, informing them that a new Player has been read in.
13. WHERE a Player has disabled push notifications, THE App SHALL display the new Read_In notification in that Player's in-app notification inbox instead.

---

### Requirement 9: Read In Game Mechanics

**User Story:** As a Read_In Player, I want to record Game_Calls and see their outcomes in the group feed, so that the Read In game is tracked in the moment without creating ongoing slap debts.

#### Acceptance Criteria

1. WHILE a Player's Read_In status is active for a Group, THE App SHALL allow that Player to record a Game_Call within that Group.
2. WHEN a Game_Call is recorded, THE App SHALL prompt the caller to select which Read_In Players present did not have a Permanent_Mark on their drink and therefore received the chug punishment.
3. WHEN a Game_Call is recorded and the singled-out Player does have a Permanent_Mark on their drink, THE App SHALL record the caller as the Player who received the chug punishment instead.
4. WHEN a Game_Call is recorded, THE App SHALL create a Chug_Event capturing the caller, the Players who received the chug punishment, and the timestamp.
5. THE App SHALL NOT create a Slap_Debt when a Chug_Event is recorded.
6. WHEN a Chug_Event is created, THE App SHALL publish an entry to the Group_Feed.
7. WHILE a Player's Read_In status is active for a Group, THE App SHALL display the full Chug_Event details in the Group_Feed for that Player, including the caller and all Players who received the chug punishment.
8. IF a Player who is not Read_In views the Group_Feed, THEN THE App SHALL display only a non-specific indicator that a Game_Call was made, with no caller, no outcome, and no Player details.
9. WHEN a Player confirms the Read_In_Prompt, THE App SHALL immediately display the rules of the Read_In_Game to that Player.
10. WHILE a Player's Read_In status is active for a Group, THE App SHALL make the Read_In_Game rules accessible to that Player at any time within the Group.
11. IF a Player who is not Read_In attempts to view the Read_In_Game rules, THEN THE App SHALL deny access and display no rule details.

---

### Requirement 10: Group Feed

**User Story:** As a Player, I want to see a chronological feed of game activity in my group, so that I can stay up to date on what has happened.

#### Acceptance Criteria

1. THE App SHALL display a Group_Feed for each Group, showing a chronological list of game events for all members of that Group.
2. WHEN a Manchester Slap_Debt is created within a Group, THE App SHALL publish an entry to the Group_Feed visible to all members of that Group.
3. WHEN a Manchester Slap_Debt is resolved within a Group, THE App SHALL publish an entry to the Group_Feed visible to all members of that Group.
4. WHEN a Custom_Game Slap_Debt is created within a Group, THE App SHALL publish an entry to the Group_Feed visible to all members of that Group.
5. WHEN a Custom_Game Slap_Debt is resolved within a Group, THE App SHALL publish an entry to the Group_Feed visible to all members of that Group.
6. WHEN a Chug_Event is published to the Group_Feed, THE App SHALL display full Chug_Event details only to Players who are Read_In for that Group, and display only a non-specific indicator to all other Group members.

---

### Requirement 11: Leaving a Group

**User Story:** As a Player, I want to be able to leave a Group, so that I am no longer part of that group's games.

#### Acceptance Criteria

1. THE App SHALL allow a Player to leave a Group they are a member of.
2. WHEN a Player leaves a Group, THE App SHALL void all of that Player's outstanding Slap_Debts (those with status "pending" or "resolved" but not yet "delivered") within that Group.
3. WHEN a Slap_Debt is voided due to a Player leaving a Group, THE App SHALL mark that Slap_Debt as a Voided_Debt with a "shame" status.
4. THE App SHALL retain all Voided_Debts in the Group ledger as a historical record, visible to remaining Group members.
5. WHEN a Slap_Debt is voided, THE App SHALL record the reason as the departure of the Player from the Group.

---

### Requirement 12: Infinity Grog

**User Story:** As a Player, I want my group to maintain an Infinity Grog bottle, so that players can settle slap debts by taking a shot instead of receiving a slap, and the bottle's evolving contents are tracked over time.

#### Acceptance Criteria

1. THE App SHALL support an optional Infinity_Grog per Group, which must be set up by a Group_Admin before it can be used.
2. WHEN a Group_Admin sets up the Infinity_Grog, THE App SHALL allow them to define the initial list of liquors in the bottle; only liquors with an ABV of 40% or higher SHALL be permitted.
3. IF a Group_Admin attempts to add a liquor with an ABV below 40%, THEN THE App SHALL display a validation error and prevent the addition.
4. WHEN a resolved Slap_Debt is to be delivered, THE App SHALL allow the debtor to opt for an Infinity_Grog shot instead of a slap, provided the Group has an active Infinity_Grog.
5. WHEN a debtor opts for an Infinity_Grog shot, THE App SHALL require both the debtor and the creditor to independently confirm the shot was taken before the debt is marked as settled, following the same two-party confirmation pattern as slap delivery.
6. WHEN both parties confirm the Infinity_Grog shot, THE App SHALL mark the Slap_Debt as "delivered" and record that it was settled via Infinity_Grog.
7. WHEN an Infinity_Grog shot is confirmed, THE App SHALL prompt the debtor to select which liquor in the bottle is being replaced to top it back up.
8. THE debtor SHALL be free to choose any replacement liquor, provided it has an ABV of 40% or higher; no further approval is required.
9. IF a debtor attempts to record a replacement liquor with an ABV below 40%, THEN THE App SHALL display a validation error and prevent the submission.
10. THE App SHALL record each Infinity_Grog shot event, capturing the Player who took the shot, the debt it settled, the liquor that was consumed, the replacement liquor chosen, and the timestamp.
11. THE App SHALL display a chronological Grog_Timeline for the Group's Infinity_Grog, showing all shot events and admin edits in order, so members can see how the bottle's contents have evolved.
12. THE App SHALL display the current contents of the Infinity_Grog bottle at any time, reflecting all shots taken and replacements made.
13. A Group_Admin SHALL be able to edit the current contents of the Infinity_Grog at any time (e.g. to correct an error or reflect an out-of-app change); all such edits SHALL be recorded in the Grog_Timeline.
14. IF a Group_Admin attempts to add or edit a liquor entry with an ABV below 40%, THEN THE App SHALL display a validation error and prevent the change.
15. WHEN an Infinity_Grog shot event or admin edit is recorded, THE App SHALL publish an entry to the Group_Feed visible to all members of that Group.
16. THE App SHALL display a Skull_Visualizer on the Infinity_Grog screen: a skull-shaped graphic filled with colour-coded segments representing each liquor currently in the bottle, sized proportionally to that liquor's share of the total volume.
17. THE App SHALL label each segment within the Skull_Visualizer with the liquor name and its percentage of the total bottle contents.
18. WHEN the contents of the Infinity_Grog change (due to a shot and replacement or an admin edit), THE App SHALL animate the Skull_Visualizer to transition smoothly from the previous state to the new state.
19. THE App SHALL allow a Player to scrub through the Grog_Timeline and see the Skull_Visualizer update to reflect the bottle's contents at each historical point in time.

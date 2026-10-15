# SlapWise

A social "slap tracker" app for a group of friends — groups, challenges, a ledger
of debts, and the Grog / Manchester game flows. React Native frontend, AWS
serverless backend.

## Layout

| Directory         | What it is                                                        |
| ----------------- | ----------------------------------------------------------------- |
| `app/`            | **The frontend.** React Native on Expo SDK 57. All UI work goes here. |
| `infrastructure/` | AWS CDK (TypeScript). Cognito, AppSync, API Gateway, DynamoDB, Lambda, notifications. |

`app/src/` is organised as `screens/`, `services/`, `store/` (Zustand),
`navigation/`, `theme/`, `constants/`, `config/`, `types/`, `tests/`.

### Directories that no longer exist

`web/` (Vite + shadcn/ui) and `mobile/` (.NET MAUI) were removed on 2026-07-25.
Both were experiments born of frustration with React Native, and both turned out
more cumbersome than React Native itself. **Do not recreate them or suggest
porting to them.** They are recoverable from git history before `9e44a0e` if
anyone ever asks, along with the deleted `SlapWise.slnx`.

## Commands

From the repo root:

```bash
npm run build      # CDK tsc + app typecheck
npm run test:app   # vitest, 59 tests
npm run install:all
```

From `app/`:

```bash
npm start                  # expo start
npm run android            # expo run:android
npm run typecheck
npm test
npm run build:ios:preview  # EAS cloud build
```

Deploys are `npm --prefix infrastructure run deploy` (dev) or `deploy:prod`,
which run `cdk deploy` and then `scripts/generate-amplify-config.js` to write
`app/amplifyconfiguration.<stage>.json`. The stage is read from the stack names
in `cdk-outputs.json`, so the file written always matches what was deployed.
**These files are committed** — nothing in them is secret, since every value
ships inside the binary — so commit the one a deploy rewrites.

`src/config/amplify.ts` picks one by `EXPO_PUBLIC_STAGE`, which each EAS build
profile sets in `eas.json` (`production` → `prod`, the rest → `dev`); local runs
default to dev. **That inlining needs `babel-preset-expo`.** Until 2026-10-15
`babel.config.js` used React Native's own preset, which leaves
`process.env.EXPO_PUBLIC_STAGE` as a runtime read; a phone has no such variable,
so every build, TestFlight included, silently fell back to dev and prod was never
used. To check a change to the Babel or env setup, run
`EXPO_PUBLIC_STAGE=prod npx expo export --platform ios --no-bytecode` and look
for `var t="prod"` in the bundle. It was a single gitignored `amplifyconfiguration.json` until
there were two stacks: whichever deployed last silently won, and keeping it out
of git needed an `.easignore` that turned out never to have worked (EAS reads
`.easignore` only at the repo root, and it lived in `app/`). There is no
`.easignore` now; EAS falls back to `.gitignore`.

`cdk-outputs.json` is still a single file holding whichever stage deployed last.
The seed and wipe scripts read it and **refuse to run unless it is dev**, since
`wipe` deletes every Cognito user in the pool.

Node version is pinned in `.node-version` (24.14.0). EAS does not see that file
— it builds from `app/` — so the `simulator` profile pins `node` itself; the
other profiles still get EAS's default.

### Seeding dev data

`npm --prefix infrastructure run seed` repopulates a deployed stack with three
users, a group, and Manchesters covering every state the UI renders. Add
`-- --wipe-first` to delete the three seed users *and* empty the DynamoDB table first;
without the wipe it is still safe to re-run, since it reuses a same-named group
and tolerates repeat joins and read-ins.

It drives the real REST and GraphQL APIs rather than writing DynamoDB directly.
That is deliberate: one Manchester is a transaction of a `DEBT#` record plus a
GSI4 index row per participant, each carrying denormalised status, statement,
debtor, creditor and punishment. Hand-writing those rows would be a second copy
of the write model that goes stale the moment a resolver changes.

Two things worth knowing before editing it. Resolution and delivery each need
**two** confirmations, one per party, and only the second flips the debt — seed
one side and everything sits in Needs Action. And every grog mutation is
admin-gated, so liquor has to be added as the group creator.

`npm --prefix infrastructure run wipe` empties the stack and seeds nothing, for
walking through onboarding by hand. It deletes **every** Cognito user, not just
the seed ones — emptying the table removes each player's PROFILE row, and
post-confirmation only writes that at signup, so a surviving account would sign
in as a player with no profile.

After a wipe, run `adb shell pm clear com.slapwise`. JWTs are stateless, so
deleting the Cognito user does not invalidate the token already on the device:
the app bootstraps happily as a player who no longer exists, finds no groups,
and lands on the welcome screen as though you had never signed up.
On iOS there is no `pm clear`: delete the app and reinstall it from TestFlight.

`npm --prefix infrastructure run wipe:prod` is the one way to run any of this
against prod: the wipe only, never the seed, for clearing test data before a
release. It needs `cdk-outputs.json` to describe prod, so run `deploy:prod`
first if dev deployed last, and it asks you to type `prod` before it deletes
anything.

### Naming

Everything is `SlapWise` / `slapwise` — the AWS profile, the DynamoDB table, the
`${stage}-SlapWise*Stack` stack names, the `SlapWiseRest` API, the
`${stage}-slapwise-*` Lambda names, and the ARN patterns in
`iam-deploy-policy.json`.

The infrastructure was originally named `SlapTracker` and was renamed on
2026-07-25. The one survivor is the Kiro spec feature id `social-slap-tracker`
(`.kiro/specs/social-slap-tracker/`, and the `// Feature: social-slap-tracker`
comment convention in tests) — that's a spec identifier, not an AWS name, and
was deliberately left alone.

## Design system

`app/src/theme/index.ts` is the single source of colour, type, spacing and
radius. **No screen should contain a hex literal** — the only survivors are two
`shadowColor: '#000'`, which are shadows rather than palette values.

The direction is "Scoreboard": Clemson orange `#F56600` on near-black, with
Clemson regalia purple as the secondary marker. The group is called Clemson
Boys, so the accent carries a real signal rather than being an arbitrary pick.

Three rules the tokens encode, worth not undoing:

- **Destructive is an outline, never a fill**, and `dangerText` is deliberately
  not orange-adjacent. The old palette used one red for both `Delete Group` and
  ordinary navigation links.
- **Weight lives in the family name, never in `fontWeight`.** Oswald ships via
  `@expo-google-fonts/oswald` and is loaded in `App.tsx`. On Android a custom
  family *plus* a `fontWeight` makes React Native look for a synthetic variant,
  fail, and silently fall back to the system face — you get the layout of the
  custom font with none of the type.
- **Every screen pushed above the tabs uses `navigation/screenOptions.ts`.**
  Without it the native stack falls back to the platform's white header. It also
  sets `contentStyle`, so a new screen lands on the dark ground before anyone
  styles it.

`displayName()` in the theme strips the local part off an email. It is a
fallback for legacy rows, not the mechanism — see below.

## The feed

`GroupFeedScreen` groups entries by `refId` into threads, orders steps
oldest-first inside a thread and threads newest-first between them, so a settled
Manchester that gains a step jumps back to the top and still reads in order.
The grouping is entirely client-side.

Feed entries carry denormalised detail — statement, the two parties, outcome,
punishment — because a bare entry cannot say who did what to whom, and joining
per row would be an N+1. **Ids, never names**: display names are editable, so a
stored name makes every historical entry lie after a rename. The client resolves
ids against the group's member list at render time. Every field is nullable and
the row falls back to `summary`, which is all that entries written before this
carry.

`grog_shot` is a shot no Manchester asked for, recorded from the Grog tab's
Take a Shot. It has no debt, so `takeFreeGrogShot` mints `SHOT#<uuid>` and uses
it wherever a debt id would go: the feed entry's `refId` (so it threads alone),
the history event's `sourceDebtId`, and the pending add-back's key, which is why
`redeemAddBack` and friends handle it unchanged. Only the drinker can record
one, and it earns an add-back like any other shot. The optional reason rides in
`statement`.

`member_joined` is in the `FeedEntryType` enum but **nothing writes it**, and
`chug_event` rows were written by the retired `recordGameCall` — old data only.

The feed's bottom bar is where calls start: Call Manchester for everyone, Call
<game> for read-in players only.

### The read-in game

A read-in player calls out other read-in players; each answers covered or not —
or the caller answers for them, since the game is ad hoc and the caller is
usually looking at the cup. The first answer recorded for a player sticks,
whoever gave it, and carries `answeredBy`. When the last answer lands the call
settles. **Everyone not covered chugs, and
if anyone called was covered the caller chugs too.** The rule lives in
`infrastructure/lambda/game-call/logic.ts` and is tested from the app suite.
The game is named by the group's admins (`readInGameName`); `copy/game.ts` falls
back to "Game".

**Secrecy is enforced on the server.** `getFeed` is a Lambda, not a DynamoDB
resolver, because it has to redact `readInOnly` entries for anyone not read in:
type, time and refId survive (so the row still threads and says *something*
happened), everything naming who or what is nulled and `redacted` is set.
`getGameCalls` refuses non-read-in callers outright. The old API —
`recordGameCall`, `getChugEvents`, `onChugEventCreated` — handed game details to
any signed-in user and was removed rather than patched. **Do not add a
subscription for game calls**: a subscription payload goes to every subscriber
unfiltered, which is exactly how the old one leaked. The feed refetches on focus
and the people involved get a push.

Game pushes go only to the players involved and never name the game — a lock
screen is read by whoever is holding the phone.

**Rules come in two halves.** The mechanics ship in the app
(`copy/gameRules.ts`) and must say what `game-call/logic.ts` does — change them
together. The group's house rules (what counts as the mark) are written by
read-in admins and live in their own `GROUP#<id>` / `READIN#RULES` item, served
by `getReadInRules` to read-in players only. They are deliberately **not** an
attribute on METADATA: `get-group` returns METADATA to every member, so one
careless field there would publish the secret. Reading in lands on the rules
screen.

### Who a punishment happens to

`src/copy/punishment.ts` owns this phrasing, and it is the only place that
should. **The debtor takes the punishment; the creditor delivers it** — the grog
resolver rejects a shot unless the caller is the debtor, which settles the
direction. The app used to say "Marcus owes Jordan a slap", which reads as
Marcus having to go and slap Jordan: exactly backwards. It now says what
physically happens — "Marcus gets slapped by Jordan", "Kyle takes a shot from
the grog". Slaps name both people; the grog is impersonal because the thread
already shows who the dispute was with.

### Players who leave

Leaving is a **hard delete**: `leave-group` removes the Member row and every
debt the leaver is party to that is not yet `delivered`. Delivered debts, feed
entries and grog history keep their id, so the member list no longer has a name
for it. Every screen's name lookup therefore falls back to
`quitterName(id)` in `src/copy/quitter.ts` — a fixed pick, hashed from the id,
from a short list of insults — rather than to the raw id. A new screen that
resolves ids against the member list should do the same.

The creator cannot leave: they are the one admin a group is guaranteed to have,
and every grog mutation is admin-gated. They get Delete Group instead. A
departing admin is removed from METADATA `adminIds` so rejoining does not hand
the role back.

## Display names

Players choose a display name at signup. It lives in the Cognito
`preferred_username` attribute, which the pool already declared as mutable and
which carries no uniqueness constraint (`signInAliases` is email-only), so two
friends may share a name.

The name is written in three places and read from a fourth, so a change has to
fan out: `post-confirmation` writes the Player profile, `create-group` and
`join-group` denormalise a copy onto each Member record, and the group screens
read those copies. `update-username` handles the fan-out with one GSI1 query —
Member records carry `GSI1PK = PLAYER#<id>` and the profile shares that
partition.

**`update-username` deliberately does not touch Cognito.** Doing so needs the
user pool id, and `CognitoStack` already depends on `LambdaStack` for its
triggers, so referencing the pool from a Lambda is a circular stack dependency.
The client updates its own attribute through Amplify's user-scoped call and the
Lambda does the DynamoDB half. Cognito is written first on purpose: if the
fan-out fails, new joins still pick up the new name and a retry converges.

The app client has `adminUserPassword: true` **only** so the seed script can
mint tokens. The app itself signs in over SRP and never uses that flow.

## Expo specifics

**Continuous native generation.** `app/android/` and `app/ios/` are generated by
`expo prebuild` from `app.json` and are gitignored. Never commit them, and never
hand-edit them expecting the change to survive.

**iOS builds only work through EAS.** There's no Mac in this setup, and
`expo prebuild` can't generate the iOS project on Windows — EAS Build does it
remotely. That constraint is the entire reason the app was migrated to Expo.

**`app.json` has `"owner": "nupham"`.** That is the Expo account name and it is
correct. It differs by one letter from the GitHub account (`jupham`) and looks
like a typo. It is not. Do not "fix" it.

**Icons.** iOS uses the Icon Composer bundle `assets/slapwise.icon` directly
(`ios.icon`), so iOS 26 gets the Liquid Glass icon and Xcode derives the
fallback for older releases. Android, the splash and the notification icon
cannot read `.icon`, so they use PNGs in `assets/` rendered from its
`slapwise-hand.svg` with the same purple-to-orange gradient. Change the art in
the `.icon` and those PNGs go stale — re-render them from the new SVG.

The splash is held by `SplashScreen.preventAutoHideAsync()` in `App.tsx` until
fonts and bootstrap are done, so the app never paints a blank or spinner frame.

### iOS-only UI rules

Android forgives these, so they go unseen until an iOS build.

**Any screen with a text field is rooted in `screens/components/FormScroll`.**
iOS neither moves content out from under the keyboard nor gives number pads a
return key. A plain `View` root left the Sign In screen's Register link under
the keyboard with no way to dismiss it. `FormScroll` is a ScrollView that pads
itself by the keyboard's height and dismisses on a tap outside a control or on
a drag. Pass the screen's container style as `contentContainerStyle`, with
`flexGrow: 1` rather than `flex: 1`, or the content can never scroll.

**Never render a `Modal` beside one that is showing, or open one in the same
render that closes another.** iOS presents from the topmost view controller
only, and drops the second one silently: no error, nothing on screen. That is
why Initialize Grog's "+ Add" did nothing on iPhone. Nest the second `Modal`
inside the first, as `InitializeGrogSheet` and `InfinityGrogSentenceScreen` now
do. Sibling sheets on a plain screen, one at a time, are fine.

**The app is dark-only, so `app.json` says so: `userInterfaceStyle: "dark"`.**
It said `"automatic"`, so on a phone in light mode iOS drew its own chrome
light: the iOS 26 Liquid Glass back button flickered light grey to dark on
every push as it re-adapted to the dark header, and the white window behind
the screens showed at the rounded corners of each transition. The top-level
`backgroundColor` (applied by `expo-system-ui`) is the dark ground behind
everything.

### `app/scripts/patch-native-modules.js` — do not delete

React Native sets `ANDROID_STL=c++_shared`, so native modules link against
`libc++_shared.so` rather than bundling their own C++ runtime. Eight modules
(reanimated, worklets, svg, safe-area-context, screens ×2, gesture-handler,
expo-modules-core) use `std::` symbols without declaring `c++_shared` in their
CMake `target_link_libraries`. Older NDKs linked the STL implicitly and covered
for them; NDK 27 does not. This script adds the missing declaration.

It runs on `postinstall`, so it re-applies after every `npm install`, including
on EAS. Without it the Android build fails at link time with undefined `std::`
symbols. It looks like cruft. It is load-bearing.

If a dependency bump reformats one of those CMake files the pattern stops
matching; the script now fails loudly and exits non-zero rather than skipping
silently. On an EAS **iOS** build it warns and continues, since these targets are
Android-only. Whether all eight patches are still individually necessary has
never been tested.

## Backend sharp edges

Much of the backend predates the model being fully worked out, so it has places
where the obvious reading is wrong. Each of these cost real debugging time —
add to the list rather than rediscovering them.

**`getDebts(groupId)` does not return all debts.** `status` is optional in the
schema, but the resolver defaults a missing one to `pending`:

```
#set($status = $util.defaultIfNullOrBlank($ctx.args.status, "pending"))
```

It queries GSI2, whose partition key is `GROUP#<id>#STATUS#<status>`, so a
single call can only ever return one status. Omitting it quietly returns
pending — not everything, and no error. Fetch each status you need in parallel;
`ManchesterService.getAllDebts` does exactly that.

**A first resolution confirmation writes no feed entry.** Only the second one
does, because one party answering is a state rather than an event. Anything that
needs to know whose turn it is has to read the debt, not the feed.

**`getCurrentUser().username` is not a username.** The pool signs in by email
alias, so Cognito's own username is a generated UUID. Read `preferred_username`
from the user attributes instead — see `AuthService.currentPlayer`.

**Every grog mutation that edits the contents is admin-gated**, including
adding liquor. `isAdmin` is checked in the grog resolver, so non-admin members
get `UNAUTHORIZED` on writes that look innocuous. The exceptions are drinking
and paying it back: `takeGrogShot` and `redeemAddBack` need the caller to be the
debtor, and `takeFreeGrogShot` needs only membership.

**The grog never drops an entry, and that is the point.** A shot shaves a
proportion off every entry, so an entry approaches zero without reaching it —
the contents keep a trace of every bottle ever poured in. `applyAddLiquor`
merges by brand+category, so the entry count is bounded by *distinct brands ever
used*, not by shots taken; ~18 in a 400-shot simulation. Do not reintroduce a
threshold filter to "clean up" trace entries.

The one that used to be there (`.filter(e => e.amountMl > 0.01)`) was also
hiding a bug. Removing a full `SHOT_ML` proportionally from a grog holding
*less* than a shot drove every entry negative; the filter then swept the
negatives away, so the underflow never surfaced. `applyProportionalRemoval` now
removes `min(SHOT_ML, total)` and clamps at zero, so a near-empty grog drains to
exactly empty.

**The skull is the picture; the contents list is the record.** They are allowed
to disagree. `computeLayers` draws one band per *liquor type* — `CATEGORY_COLORS`
is keyed by category, so per-entry bands drew a seam through the middle of what
already looked like one band — and drops any band thinner than `MIN_BAND_UNITS`,
renormalising the rest so the surface still lands at the right height. The
contents list shows every entry regardless. Both order themselves by the
`CATEGORY_COLORS` key order so the list reads in the same direction as the
skull.

**Tab screens must refetch on focus.** They stay mounted, so a mount-only
`useEffect` never sees anything that happened while you were on another tab.
All four use `useFocusEffect`; a new tab screen needs it too, with a
`hasLoadedRef` guard so the spinner only blocks the first load. Group home and
My Slate lacked the guard, so coming back from any pushed screen blanked the
whole tab to a spinner for a moment; theirs is keyed on the group id, so
switching groups still shows it.

**Invite codes do not expire; New Code is how you revoke one.** A code is two
items: the `INVITE#<code>` / `LOOKUP` row `join-group` reads, and an
`INVITE#<code>` twin under the group so `delete-group` can find it — the lookup
sits outside the group's partition, so it has to be deleted by name.
`regenerate-invite-code` deletes the old pair in the same transaction that
writes the new one. Codes used to carry a 7-day TTL that Group home never
showed, so a week-old group displayed a code `join-group` rejected as
`INVALID_INVITE_CODE`, and regenerating left the old code live anyway. Codes
issued before the change still carry that TTL until regenerated once, which is
why `join-group` still checks it.

**Every group read must check membership.** Signing in proves who you are, not
which groups you are in, and a group id is not a secret — anyone who has left
still has it. Direct DynamoDB resolvers that take a `groupId` go through
`memberGated(...)` in `appsync-stack.ts`, a pipeline whose first step
(`requireMember`) looks up the caller's Member row and returns Unauthorized if
there is none; group subscriptions run the same check at subscribe time.
Lambdas check for themselves. Fields that read only the caller's own rows, keyed
on `$ctx.identity.sub` (`getGroups`, `getMyDebts`), need no gate. A new
resolver that skips this reopens the hole that `getGroupMembers`, `getDebts`,
`getGrog`, `get-group` and `createChallenge` all had.

**No apostrophes in `schema.graphql` comments.** AppSync does not skip a `#`
comment the way the GraphQL spec says. A two-line comment in the
`FeedEntryType` enum with an apostrophe on each line ("the shot's own id",
"the drinker's reason") failed with "non unique enum value 'the'": the text
was read as enum values. The two older comments with a single apostrophe
deploy fine, so the exact rule is unclear; leave apostrophes out of new ones. CloudFormation reports only "GraphQLSchema did not stabilize" and
the rollback overwrites the reason, so to see it run
`aws appsync start-schema-creation` against the **dev** API and then
`get-schema-creation-status`. Standard GraphQL validators pass the schema.

**Removing a Lambda that AppSync uses takes two deploys.** AppSync imports each
function's ARN as a cross-stack export, and CDK deploys `LambdaStack` before
`AppSyncStack`. Delete the function in one go and `LambdaStack` tries to drop an
export AppSync still imports; CloudFormation refuses ("Cannot delete export …
as it is in use") and rolls back. Instead: keep the function for one deploy and
pin its export with `this.exportValue(fn.functionArn)` while AppSync moves off
it, then delete both in the next. Retiring `recordGameCall` hit exactly this.

**Every Lambda ships the whole `dist/lambda` tree, and the directory name is in
the handler path.** There is no bundler in this pipeline — just `tsc` — so an
import of `../shared/cors` is emitted verbatim as `require('../shared/cors')`.
When each function was its own `fromAsset` directory that path resolved above
the asset root, so the file was simply *not in the package* and the function
died at cold start on `MODULE_NOT_FOUND`. tsc never notices, because in the
source tree the path is real. Rooting the asset at `dist/lambda` and using
`handler: '<name>/index.handler'` makes the relative import true at runtime;
CDK hashes the directory once, so it is one upload rather than twenty.

`update-username` shipped broken this way and nobody saw it, because the rename
UI lived in a drawer that had no button opening it until the Account entry point
was added to Group home.

## Notifications

Push goes **Lambda → SNS → `notification-dispatcher` → Expo push service →
device**. The dispatcher is *subscribed* to the topic; it previously held
`grantPublish` instead, which is why every producer published happily into a
topic with no subscribers and nothing was ever delivered.

Expo's push service rather than SNS mobile push or Pinpoint. EAS already holds
the FCM and APNs credentials, so there is no platform application to configure
and no per-device SNS endpoint to keep in step with a rotating token. A Pinpoint
app, IAM for it, and `pinpointEndpointId`/`pushEnabled` on every profile were
deployed for a push implementation that was never written; they were removed
rather than finished, since AWS has Pinpoint on a deprecation path. The
`mobiletargeting:*` grants in `iam-deploy-policy.json` stay until the removal
has actually been deployed — CloudFormation needs `DeleteApp` to tear the
Pinpoint app down, and dropping the permission first strands it.

`shared/notifications.ts` owns the event contract. **The publisher states the
audience** — `{ kind: 'players' }` or `{ kind: 'group', excludePlayerIds }` —
because only the mutation knows whether something is somebody's turn or the
group's entertainment. Group events exclude whoever caused them; a push telling
you what you just did is the fastest way to get notifications switched off.
`publishNotification` swallows its own failures, so a notification can never
fail the mutation that raised it.

Eight events push. Individually: `manchester_created`,
`confirmation_awaiting_you`, `manchester_resolved` (debtor only — the creditor
is owed something, which can wait), `game_called` (the players called) and
`game_settled` (the caller and everyone called). To the group:
`manchester_settled`, `grog_shot_taken`, `member_joined`. `chug_event` and `player_read_in` still
*publish* and are deliberately dropped by the dispatcher, so reinstating them is
a change at one end rather than two.

**`confirmation_awaiting_you` is load-bearing.** A first confirmation writes no
feed entry — one party answering is a state, not an event — so this push is the
only thing that tells the other player it is their move.

**The dispatcher resolves display names; feed entries do not.** Both rules point
the same way for different reasons: a stored name makes history lie after a
rename, whereas a notification is rendered once and read once, so it cannot go
stale — and the device has no member list to resolve ids against when a push
lands. Its phrasing has to track `app/src/copy/punishment.ts` by hand, since
nothing can be imported across the `app/` ↔ `infrastructure/` boundary.

Push tokens are `PK=PLAYER#<id>`, `SK=PUSHTOKEN#<token>`, one per device, with a
TTL. They carry **no GSI1 keys on purpose**: `GSI1PK = PLAYER#<id>` is the
"everything this player owns" query, and both `update-username` and
`delete-account` walk it writing a `username` onto every row they find. Staying
out of that index is cheaper than teaching both to skip it — `delete-account`
removes tokens with its own explicit query instead.

## Known rough edges

- **iOS is on TestFlight, but only lightly exercised.** Production builds go
  through `npx eas-cli build --platform ios --profile production --auto-submit`,
  which needs nothing local beyond Node, so it runs from Windows. SDK 57 cannot
  be built locally on an Intel Mac at all: `expo-modules-jsi` needs Xcode 27,
  which needs macOS 26.6 and Apple silicon. The `simulator` profile still works
  for a quick look (`x86_64` slices, release build, no hot reload).
- **iOS layout is barely tested on a notched iPhone.** The safe-area work is
  written correctly — the tab bar grows by `insets.bottom` — but the first
  TestFlight build turned up two iOS-only bugs straight away (see *iOS-only
  UI rules*), and more are likely.
- **No test covers the display-name path, the seed script, or notifications.**
  The vitest tests predate all three and exercise domain logic only.
- **No push notification has been delivered to a real device yet.** The whole
  path typechecks and synthesizes, but `Device.isDevice` is false on a simulator
  and `getExpoPushTokenAsync` needs a development or EAS build — Expo Go will not
  do. So this needs `npm run android` on a physical phone to prove out.
- **A game call can stall** if neither the players called nor the caller ever
  answer. The caller can settle anyone's answer, so in practice it stalls only
  if the caller leaves or forgets; nothing times it out.
- `infrastructure/bin/app.ts` is CDK **source**, not a build output. Ignore rules
  for `bin/`/`obj/` must stay path-scoped or they will swallow it.
- `README.md` is an empty stub (UTF-16, one heading).

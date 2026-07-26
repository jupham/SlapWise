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
npm run test:app   # vitest, 44 tests
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

Deploys are `npm --prefix infrastructure run deploy`, which runs `cdk deploy`
and then `scripts/generate-amplify-config.js` to write
`app/amplifyconfiguration.json`. That file is **generated, not committed** —
it's gitignored, so a fresh clone has to deploy (or obtain it) before the app
can authenticate.

`app/.easignore` exists solely because of that. EAS Build uploads via git, so a
gitignored config would be absent from the build — which compiles fine and then
fails on device with no Amplify config. When `.easignore` is present EAS uses it
*instead of* `.gitignore`, so it has to restate every other exclusion; if you add
something to `.gitignore` that must not ship, add it there too.

Node version is pinned in `.node-version` (24.14.0).

### Seeding dev data

`npm --prefix infrastructure run seed` repopulates a deployed stack with three
users, a group, and Manchesters covering every state the UI renders. Add
`-- --wipe-first` to clear the Cognito users *and* the DynamoDB table first;
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

After a wipe, run `adb shell pm clear com.slapwise`. JWTs are stateless, so
deleting the Cognito user does not invalidate the token already on the device:
the app bootstraps happily as a player who no longer exists, finds no groups,
and lands on the welcome screen as though you had never signed up.

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

`member_joined` is in the `FeedEntryType` enum but **nothing writes it**, and
`chug_event` is deliberately unstyled for now — it is one caller and a list of
chugged players, so it does not fit the two-party thread shape.

### Who a punishment happens to

`src/copy/punishment.ts` owns this phrasing, and it is the only place that
should. **The debtor takes the punishment; the creditor delivers it** — the grog
resolver rejects a shot unless the caller is the debtor, which settles the
direction. The app used to say "Marcus owes Jordan a slap", which reads as
Marcus having to go and slap Jordan: exactly backwards. It now says what
physically happens — "Marcus gets slapped by Jordan", "Kyle takes a shot from
the grog". Slaps name both people; the grog is impersonal because the thread
already shows who the dispute was with.

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

## Known rough edges

- **The EAS iOS build has never actually been run.** It is the one unproven part
  of the Expo migration and the migration's whole purpose. `npm run build:ios:preview`.
  It also needs a paid Apple Developer account: `eas.json`'s `preview` profile is
  `distribution: "internal"`, and there is no way to get an ad-hoc iOS build onto
  a device without one.
- **The design has only ever run on an Android emulator.** The safe-area work is
  written correctly — the tab bar grows by `insets.bottom` — but a notched iPhone
  has very different insets, and the Grog screen's absolutely-positioned drawer
  tab is the kind of thing that lands wrong there.
- **No test covers the display-name path or the seed script.** The 44 vitest tests
  predate both and exercise domain logic only.
- `infrastructure/bin/app.ts` is CDK **source**, not a build output. Ignore rules
  for `bin/`/`obj/` must stay path-scoped or they will swallow it.
- `README.md` is an empty stub (UTF-16, one heading).

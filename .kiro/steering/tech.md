# Tech Stack

## App (React Native)
- React Native 0.84 + React 19
- TypeScript (strict mode)
- AWS Amplify v6 (`aws-amplify`, `@aws-amplify/auth`, `@aws-amplify/react-native`) for auth and AppSync GraphQL
- React Navigation v7 (native stack)
- Zustand v5 for global state
- `react-native-reanimated`, `react-native-screens`, `react-native-safe-area-context`, `react-native-svg`
- Vitest + fast-check for unit and property-based testing

## Infrastructure (AWS CDK)
- AWS CDK v2 (TypeScript)
- Stacks: Cognito, AppSync (GraphQL), API Gateway (REST), DynamoDB, Lambda, Notifications (Pinpoint)
- GraphQL schema at `infrastructure/lib/graphql/schema.graphql`
- Deploy outputs written to `cdk-outputs.json`, then converted to `app/amplifyconfiguration.json` via `scripts/generate-amplify-config.js`

## Common Commands

### Root (run from repo root)
```bash
npm run install:all       # Install all dependencies
npm run build             # Build infra (tsc) + typecheck app
npm run build:infra       # Compile infrastructure TypeScript
npm run build:app         # Typecheck app only
npm run test:app          # Run app tests
npm run clean             # Remove node_modules and dist
npm run clean:install     # Clean then reinstall
```

### App (run from `app/`)
```bash
npm run start             # Start Metro bundler
npm run android           # Run on Android
npm run ios               # Run on iOS
npm run typecheck         # TypeScript check (no emit)
npm run test:coverage     # Run Vitest with coverage (single run)
```

### Infrastructure (run from `infrastructure/`)
```bash
npm run build             # Compile TypeScript
npm run deploy            # CDK deploy all stacks + generate Amplify config
npm run synth             # CDK synth (dry run)
```

## TypeScript Conventions
- `any` is **banned** in all TypeScript code — both implicit and explicit
- `noImplicitAny: true` is set in both `app/tsconfig.json` and `infrastructure/tsconfig.json`
- Never use explicit `any` annotations; use `unknown`, proper types, or generics instead
- For DynamoDB pagination keys, use `Record<string, AttributeValue>` from `@aws-sdk/client-dynamodb` (not `DocumentClient`)

## Notes
- Path alias `@/*` maps to `app/src/*`
- Tests live in `app/src/tests/`; use `vitest --run` (not watch mode) in CI/automation
- Property-based tests use `fast-check`

## Display Names
- Never display raw player IDs (`playerId`, `challengerId`, `debtorId`, etc.) in the UI
- Always resolve IDs to usernames using a `memberId → username` map built from `GroupService.getGroupMembers()`
- Load members alongside any screen data that shows player names — use `Promise.all` to fetch in parallel
- Fallback chain: `member.username ?? member.playerId` (username is email until profile editing is added)
- All caught errors must be logged to the console with `console.error(...)` before any user-facing handling
- Include the full error object, not just the message — e.g. `console.error('[ScreenName] context:', err)`
- This applies to both app (React Native) and Lambda code

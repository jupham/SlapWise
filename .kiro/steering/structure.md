# Project Structure

Monorepo with two packages: `app/` (React Native) and `infrastructure/` (AWS CDK).

```
/
├── app/                        # React Native mobile app
│   ├── src/
│   │   ├── App.tsx             # Root component, navigation setup, auth check
│   │   ├── config/             # Amplify initialization (amplify.ts)
│   │   ├── constants/          # Shared constant values
│   │   ├── navigation/         # React Navigation type definitions
│   │   ├── screens/            # One file per screen component
│   │   ├── services/           # API call modules (AuthService, GroupService, ManchesterService)
│   │   ├── store/              # Zustand store (single store, slice pattern)
│   │   ├── tests/              # Vitest + fast-check tests
│   │   └── types/              # Shared TypeScript interfaces (mirrors DynamoDB shape)
│   ├── amplifyconfiguration.json  # Generated — do not edit manually
│   └── package.json
│
├── infrastructure/             # AWS CDK infrastructure
│   ├── lib/
│   │   ├── graphql/
│   │   │   └── schema.graphql  # AppSync GraphQL schema (source of truth for API shape)
│   │   └── stacks/             # One CDK stack per AWS service
│   │       ├── cognito-stack.ts
│   │       ├── appsync-stack.ts
│   │       ├── apigateway-stack.ts
│   │       ├── dynamo-stack.ts
│   │       ├── lambda-stack.ts
│   │       └── notifications-stack.ts
│   └── package.json
│
├── .kiro/
│   ├── specs/                  # Feature specs
│   └── steering/               # AI steering rules
└── package.json                # Root scripts only, no shared dependencies
```

## Conventions

- **Services** (`app/src/services/`): All backend calls go here. GraphQL queries use `generateClient()` from Amplify; REST calls use `authFetch()` with Cognito ID token. No API calls in screens or store.
- **Store** (`app/src/store/index.ts`): Single Zustand store composed of typed slices. Screens read from store; services populate it.
- **Types** (`app/src/types/index.ts`): All shared interfaces defined here. Types include DynamoDB key fields (`PK`, `SK`, `GSI*`) as they come directly from the API.
- **Screens** (`app/src/screens/`): Presentational + local UI state only. Call services and read/write store. No direct API calls.
- **Infrastructure stacks**: Each stack is self-contained. Cross-stack references passed via constructor props.
- **GraphQL schema** is the source of truth for the API contract. Types in `app/src/types/` should stay in sync with it.

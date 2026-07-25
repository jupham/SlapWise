import { generateClient } from 'aws-amplify/api';

// generateClient() reads Amplify's config when it is called. ES imports are
// hoisted, so a module-scope `generateClient()` in a service runs before
// index.js reaches configureAmplify() — which is what produced the
// "Amplify has not been configured" warnings at boot. Calling it per request
// instead removes the ordering dependency: by the time a service actually
// issues a query, configure() has run.
//
// Not memoised, deliberately. Caching needs a module-scope variable, and
// naming its type — `ReturnType<typeof generateClient>`, aliased, unioned with
// null, or even in a cast — makes tsc instantiate Amplify's deeply recursive
// client type and fail with TS2321 (excessive stack depth). The type is only
// safe to leave inferred from the call expression, as the old
// `const client = generateClient(...)` did. The client is a thin wrapper that
// reads the shared Amplify singleton on each call, and queries here are
// user-initiated, so rebuilding it per call is not a meaningful cost.
export function getClient() {
  return generateClient({ authMode: 'userPool' });
}

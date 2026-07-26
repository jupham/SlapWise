#!/usr/bin/env node
/**
 * Seeds a freshly deployed stack with users and realistic data.
 *
 * Everything here goes through the real REST and GraphQL APIs rather than
 * writing DynamoDB directly, so the rows are produced by the same Lambdas the
 * app uses. That matters most for Manchesters: one debt is a transaction of a
 * canonical DEBT# record plus a GSI4 index row per participant, each carrying
 * denormalised status/statement/debtor/creditor fields. Reproducing that here
 * would be a second copy of the write model that goes stale silently.
 *
 * Users are created by public SignUp followed by admin AdminConfirmSignUp,
 * which fires the PostConfirmation trigger — so the Player profile is written
 * by the real Lambda too, display name included.
 *
 * Usage:
 *   node infrastructure/scripts/seed-dev-data.js
 *   node infrastructure/scripts/seed-dev-data.js --wipe-first
 *
 * Requires: a completed deploy (reads cdk-outputs.json) and AWS credentials
 * with Cognito admin permissions — e.g. AWS_PROFILE=slapwise.
 */

// Match the profile the deploy script uses, so seeding can't quietly target a
// different account than the stacks it is seeding. Override by exporting
// AWS_PROFILE yourself.
process.env.AWS_PROFILE = process.env.AWS_PROFILE || 'slapwise';

const fs = require('fs');
const path = require('path');
const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  AdminConfirmSignUpCommand,
  AdminInitiateAuthCommand,
  AdminDeleteUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const {
  DynamoDBClient,
  ScanCommand,
  BatchWriteItemCommand,
} = require('@aws-sdk/client-dynamodb');

// ── Config ───────────────────────────────────────────────────────────────────

const PASSWORD = 'SlapWise123';
const GROUP_NAME = 'Clemson Boys';

const USERS = [
  { username: 'Jordan', email: 'jordan+seed@upham.cool' },
  { username: 'Kyle', email: 'kyle+seed@upham.cool' },
  { username: 'Marcus', email: 'marcus+seed@upham.cool' },
];

// ── Wiring ───────────────────────────────────────────────────────────────────

const outputsPath = path.join(__dirname, '..', 'cdk-outputs.json');
if (!fs.existsSync(outputsPath)) {
  console.error('cdk-outputs.json not found. Deploy first.');
  process.exit(1);
}

const flat = {};
for (const stackOutputs of Object.values(JSON.parse(fs.readFileSync(outputsPath, 'utf8')))) {
  Object.assign(flat, stackOutputs);
}

const USER_POOL_ID = flat.UserPoolId;
const CLIENT_ID = flat.UserPoolClientId;
const REST = String(flat.ApiGatewayEndpoint || '').replace(/\/$/, '');
const GRAPHQL = flat.AppSyncEndpoint;
const REGION = flat.UserPoolRegion || flat.AppSyncRegion || 'us-east-1';

for (const [name, value] of Object.entries({ USER_POOL_ID, CLIENT_ID, REST, GRAPHQL })) {
  if (!value) {
    console.error(`Missing ${name} in cdk-outputs.json — was the deploy complete?`);
    process.exit(1);
  }
}

const cognito = new CognitoIdentityProviderClient({ region: REGION });
const dynamo = new DynamoDBClient({ region: REGION });
const TABLE = flat.TableName;

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rest(token, method, route, body) {
  const res = await fetch(`${REST}${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${route} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function gql(token, query, variables) {
  const res = await fetch(GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  // AppSync returns 200 with an errors array — status alone is not enough.
  if (json.errors) {
    throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

/**
 * SignUp is the public API, so the PreSignUp and PostConfirmation triggers run
 * exactly as they do for a real registration. AdminConfirmSignUp then skips the
 * emailed code.
 */
async function createUser({ username, email }) {
  try {
    await cognito.send(
      new SignUpCommand({
        ClientId: CLIENT_ID,
        Username: email,
        Password: PASSWORD,
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'preferred_username', Value: username },
        ],
      })
    );
    await cognito.send(
      new AdminConfirmSignUpCommand({ UserPoolId: USER_POOL_ID, Username: email })
    );
    console.log(`  created ${username} <${email}>`);
  } catch (err) {
    if (err.name === 'UsernameExistsException') {
      console.log(`  ${username} already exists — reusing`);
    } else {
      throw err;
    }
  }

  const auth = await cognito.send(
    new AdminInitiateAuthCommand({
      UserPoolId: USER_POOL_ID,
      ClientId: CLIENT_ID,
      AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD },
    })
  );

  const token = auth.AuthenticationResult && auth.AuthenticationResult.IdToken;
  if (!token) {
    throw new Error(
      `No IdToken for ${email}. If this says the auth flow is not enabled, deploy ` +
        'the Cognito stack — adminUserPassword was added for this script.'
    );
  }

  // The playerId the API uses is the Cognito sub, carried in the ID token.
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  return { username, email, token, playerId: claims.sub };
}

/**
 * Empties the table. Deleting the Cognito users alone leaves their groups,
 * debts and grog behind as orphans, so a re-seed piles duplicates on top of
 * data no one can reach. Scan + BatchWriteItem is fine at dev volume; it is
 * not intended for a table of any real size.
 */
async function wipeTable() {
  if (!TABLE) {
    console.log('  no TableName in cdk-outputs.json — skipping table wipe');
    return;
  }
  let cleared = 0;
  let startKey;
  do {
    const page = await dynamo.send(
      new ScanCommand({
        TableName: TABLE,
        ProjectionExpression: 'PK, SK',
        ExclusiveStartKey: startKey,
      })
    );
    const items = page.Items ?? [];
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      await dynamo.send(
        new BatchWriteItemCommand({
          RequestItems: {
            [TABLE]: chunk.map((Key) => ({ DeleteRequest: { Key } })),
          },
        })
      );
      cleared += chunk.length;
    }
    startKey = page.LastEvaluatedKey;
  } while (startKey);
  console.log(`  cleared ${cleared} rows from ${TABLE}`);
}

async function deleteUser(email) {
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: email }));
    console.log(`  deleted ${email}`);
  } catch (err) {
    if (err.name !== 'UserNotFoundException') throw err;
  }
}

// ── GraphQL operations (mirrors of the app's own documents) ──────────────────

const CREATE_CHALLENGE = `
  mutation CreateChallenge($groupId: ID!, $statementMakerId: ID!, $statement: String!) {
    createChallenge(groupId: $groupId, statementMakerId: $statementMakerId, statement: $statement) {
      debtId status
    }
  }
`;

const SUBMIT_RESOLUTION = `
  mutation SubmitResolutionConfirmation($debtId: String!, $groupId: ID!, $outcome: ResolutionOutcome!, $punishment: PunishmentType!) {
    submitResolutionConfirmation(debtId: $debtId, groupId: $groupId, outcome: $outcome, punishment: $punishment) {
      debtId status debtPunishment
    }
  }
`;

const INITIALIZE_GROG = `
  mutation InitializeGrog($groupId: ID!, $bottleSize: Float!, $seedEntries: [AddLiquorInput!]) {
    initializeGrog(groupId: $groupId, bottleSize: $bottleSize, seedEntries: $seedEntries) {
      groupId bottleSize
    }
  }
`;

const ADD_LIQUOR = `
  mutation AddLiquorToGrog($groupId: ID!, $category: LiquorCategory!, $brand: String!) {
    addLiquorToGrog(groupId: $groupId, category: $category, brand: $brand) {
      groupId
    }
  }
`;

const CONFIRM_READ_IN = `
  mutation ConfirmReadIn($groupId: ID!) {
    confirmReadIn(groupId: $groupId) { playerId isReadIn }
  }
`;

const CONFIRM_DELIVERY = `
  mutation ConfirmDelivery($debtId: String!, $groupId: ID!) {
    confirmDelivery(debtId: $debtId, groupId: $groupId) {
      debtId status
    }
  }
`;

/**
 * Walks a Manchester as far through its lifecycle as asked.
 *
 * Resolution takes two confirmations, one from the challenger and one from the
 * statement maker; only the second one flips the debt to `resolved` and assigns
 * debtor and creditor. Delivery works the same way — the debt only reaches
 * `delivered` once both sides confirm. Submitting one side, as the first
 * version of this script did, silently leaves everything in Needs Action.
 *
 * The *first* submitter's outcome is the one that sticks. With
 * did_not_follow_through the statement maker becomes the debtor; with
 * followed_through it is the challenger.
 */
async function manchester({ challenger, statementMaker, groupId, statement, stopAt, punishment }) {
  const created = await gql(challenger.token, CREATE_CHALLENGE, {
    groupId,
    statementMakerId: statementMaker.playerId,
    statement,
  });
  const debtId = created.createChallenge.debtId;
  if (stopAt === 'pending') return debtId;

  const outcome = 'did_not_follow_through'; // statement maker ends up owing
  for (const p of [challenger, statementMaker]) {
    await gql(p.token, SUBMIT_RESOLUTION, { debtId, groupId, outcome, punishment });
  }
  if (stopAt === 'resolved') return debtId;

  // debtor = statement maker, creditor = challenger, per the outcome above.
  for (const p of [statementMaker, challenger]) {
    await gql(p.token, CONFIRM_DELIVERY, { debtId, groupId });
  }
  return debtId;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  const wipeFirst = process.argv.includes('--wipe-first');

  if (wipeFirst) {
    console.log('Wiping…');
    for (const u of USERS) await deleteUser(u.email);
    await wipeTable();
  }

  console.log(`\nUser pool ${USER_POOL_ID}`);
  console.log('Creating users…');
  const players = [];
  for (const u of USERS) players.push(await createUser(u));

  const [jordan, kyle, marcus] = players;

  // POST /groups always creates, so a re-run would leave two identically named
  // groups behind. Reuse one Jordan already owns instead.
  console.log('\nCreating the group…');
  const existing = (await rest(jordan.token, 'GET', '/groups')) || [];
  let group = (Array.isArray(existing) ? existing : existing.groups || []).find(
    (g) => g.name === GROUP_NAME
  );

  if (group) {
    group = await rest(jordan.token, 'GET', `/groups/${group.groupId}`);
    console.log(`  reusing ${GROUP_NAME} → ${group.groupId}`);
  } else {
    group = await rest(jordan.token, 'POST', '/groups', { name: GROUP_NAME });
    console.log(`  ${GROUP_NAME} → ${group.groupId} (invite ${group.inviteCode})`);
  }
  const groupId = group.groupId;

  for (const p of [kyle, marcus]) {
    // join-group is guarded by attribute_not_exists, so a repeat join throws.
    try {
      await rest(p.token, 'POST', '/groups/join', { inviteCode: group.inviteCode });
      console.log(`  ${p.username} joined`);
    } catch (err) {
      console.log(`  ${p.username} already a member`);
    }
  }

  console.log('\nReading everyone in…');
  for (const p of players) {
    try {
      await gql(p.token, CONFIRM_READ_IN, { groupId });
      console.log(`  ${p.username} read in`);
    } catch (err) {
      if (!/ALREADY_READ_IN/.test(err.message)) throw err;
      console.log(`  ${p.username} already read in`);
    }
  }

  console.log('\nCalling Manchesters…');

  await manchester({
    challenger: jordan, statementMaker: kyle, groupId,
    statement: 'I can name every state capital', stopAt: 'pending',
  });
  console.log('  pending      — Kyle, state capitals');

  await manchester({
    challenger: marcus, statementMaker: jordan, groupId,
    statement: 'I have never lost at pool', stopAt: 'pending',
  });
  console.log('  pending      — Jordan, pool');

  await manchester({
    challenger: kyle, statementMaker: jordan, groupId,
    statement: 'I will eat dogshit', stopAt: 'resolved', punishment: 'slap',
  });
  console.log('  outstanding  — Jordan owes Kyle a slap');

  await manchester({
    challenger: marcus, statementMaker: kyle, groupId,
    statement: "I'll finish the whole thing", stopAt: 'resolved', punishment: 'infinity_grog',
  });
  console.log('  outstanding  — Kyle owes Marcus an infinity grog');

  await manchester({
    challenger: jordan, statementMaker: marcus, groupId,
    statement: 'I can drink anyone here under the table', stopAt: 'delivered', punishment: 'slap',
  });
  console.log('  delivered    — Marcus paid Jordan a slap');

  // Every grog write is admin-gated (isAdmin in the grog resolver), so these
  // run as Jordan — the group creator. Kyle and Marcus joined by invite code
  // and would get UNAUTHORIZED.
  console.log('\nInitialising the grog…');
  try {
    await gql(jordan.token, INITIALIZE_GROG, {
      groupId,
      bottleSize: 750,
      seedEntries: [
        { category: 'vodka', brand: "Tito's" },
        { category: 'whiskey', brand: 'Jameson' },
      ],
    });
    console.log('  initialised at 750 mL');
  } catch (err) {
    console.log('  already initialised — leaving it alone');
  }

  for (const [category, brand] of [
    ['rum', 'Kraken'],
    ['tequila', 'Espolòn'],
    ['gin', 'Hendricks'],
  ]) {
    await gql(jordan.token, ADD_LIQUOR, { groupId, category, brand });
    await sleep(60); // keep history timestamps distinct and ordered
    console.log(`  + ${brand}`);
  }

  console.log('\nDone.\n');
  console.log(`Group:    ${GROUP_NAME} (${groupId})`);
  console.log(`Invite:   ${group.inviteCode}`);
  console.log(`Password: ${PASSWORD}`);
  for (const p of players) console.log(`  ${p.username.padEnd(8)} ${p.email}`);
  console.log('\nSign in as any of them. Pending Manchesters need the other party to respond.');
}

main().catch((err) => {
  console.error('\nSeed failed:', err.message);
  process.exit(1);
});

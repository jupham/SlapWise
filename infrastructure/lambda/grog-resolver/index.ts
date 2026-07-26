import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';
import {
  SHOT_ML,
  applyAddLiquor,
  applyRemoveLiquor,
  applyProportionalRemoval,
  applyConfirmDelivery,
  validateSeedEntries,
  buildInitialGrog,
  makeAdditionEvent,
  applyTakeGrogShot,
  applyRedeemAddBack,
  applyClearAddBack,
  PendingAddBack,
} from './logic';

const dynamo = new DynamoDBClient({});
const sns = new SNSClient({});
const TABLE = process.env.TABLE_NAME!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddLiquorInput {
  category: string;
  brand: string;
  amountMl?: number;
}

interface Args {
  groupId: string;
  bottleSize?: number;
  seedEntries?: AddLiquorInput[];
  category?: string;
  brand?: string;
  entryId?: string;
  amountMl?: number;
  debtId?: string;
  addBack?: AddLiquorInput;
}

interface AppSyncCognitoIdentity {
  sub: string;
  [key: string]: unknown;
}

interface GrogEntry {
  entryId: string;
  category: string;
  brand: string;
  amountMl: number;
}

interface GrogHistoryEvent {
  eventId: string;
  type: string;
  actorPlayerId: string;
  occurredAt: string;
  sourceDebtId: string | null;
  brand: string | null;
  category: string | null;
  amountMl: number | null;
}

interface GrogItem {
  groupId: string;
  bottleSize: number;
  entries: GrogEntry[];
  history: GrogHistoryEvent[];
  pendingAddBacks: PendingAddBack[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function err(code: string): never {
  throw new Error(code);
}

function unmarshalEntry(m: Record<string, AttributeValue>): GrogEntry {
  return {
    entryId: m.entryId?.S ?? '',
    category: m.category?.S ?? '',
    brand: m.brand?.S ?? '',
    amountMl: Number(m.amountMl?.N ?? 0),
  };
}

function unmarshalEvent(m: Record<string, AttributeValue>): GrogHistoryEvent {
  return {
    eventId: m.eventId?.S ?? '',
    type: m.type?.S ?? '',
    actorPlayerId: m.actorPlayerId?.S ?? '',
    occurredAt: m.occurredAt?.S ?? '',
    sourceDebtId: m.sourceDebtId?.S ?? null,
    brand: m.brand?.S ?? null,
    category: m.category?.S ?? null,
    amountMl: m.amountMl?.N != null ? Number(m.amountMl.N) : null,
  };
}

function unmarshalPendingAddBack(m: Record<string, AttributeValue>): PendingAddBack {
  return {
    debtId: m.debtId?.S ?? '',
    debtorId: m.debtorId?.S ?? '',
    createdAt: m.createdAt?.S ?? '',
  };
}

function marshalEntry(e: GrogEntry): AttributeValue {
  const m: Record<string, AttributeValue> = {
    entryId: { S: e.entryId },
    category: { S: e.category },
    brand: { S: e.brand },
    amountMl: { N: String(e.amountMl) },
  };
  return { M: m };
}

function marshalEvent(ev: GrogHistoryEvent): AttributeValue {
  const m: Record<string, AttributeValue> = {
    eventId: { S: ev.eventId },
    type: { S: ev.type },
    actorPlayerId: { S: ev.actorPlayerId },
    occurredAt: { S: ev.occurredAt },
    sourceDebtId: ev.sourceDebtId != null ? { S: ev.sourceDebtId } : { NULL: true },
    brand: ev.brand != null ? { S: ev.brand } : { NULL: true },
    category: ev.category != null ? { S: ev.category } : { NULL: true },
    amountMl: ev.amountMl != null ? { N: String(ev.amountMl) } : { NULL: true },
  };
  return { M: m };
}

function marshalPendingAddBack(p: PendingAddBack): AttributeValue {
  return {
    M: {
      debtId: { S: p.debtId },
      debtorId: { S: p.debtorId },
      createdAt: { S: p.createdAt },
    },
  };
}

function marshalGrog(item: Record<string, AttributeValue>): GrogItem {
  const entries = (item.entries?.L ?? []).map(v =>
    unmarshalEntry(v.M as Record<string, AttributeValue>)
  );
  const history = (item.history?.L ?? []).map(v =>
    unmarshalEvent(v.M as Record<string, AttributeValue>)
  );
  const pendingAddBacks = (item.pendingAddBacks?.L ?? []).map(v =>
    unmarshalPendingAddBack(v.M as Record<string, AttributeValue>)
  );
  return {
    groupId: item.groupId?.S ?? '',
    bottleSize: Number(item.bottleSize?.N ?? 0),
    entries,
    history,
    pendingAddBacks,
  };
}

async function fetchGrog(groupId: string): Promise<GrogItem | null> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROG#${groupId}` },
      SK: { S: 'METADATA' },
    },
  }));
  if (!result.Item) return null;
  return marshalGrog(result.Item);
}

async function isAdmin(groupId: string, playerId: string): Promise<boolean> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: 'METADATA' },
    },
  }));
  if (!result.Item) return false;
  const item = result.Item;
  const creatorId = item.creatorId?.S ?? '';
  const adminIds = item.adminIds?.SS ?? [];
  return playerId === creatorId || adminIds.includes(playerId);
}

async function writeGrog(
  groupId: string,
  entries: GrogEntry[],
  history: GrogHistoryEvent[],
  pendingAddBacks?: PendingAddBack[],
): Promise<void> {
  if (pendingAddBacks !== undefined) {
    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        PK: { S: `GROG#${groupId}` },
        SK: { S: 'METADATA' },
      },
      UpdateExpression: 'SET entries = :entries, history = :history, pendingAddBacks = :pab',
      ExpressionAttributeValues: {
        ':entries': { L: entries.map(marshalEntry) },
        ':history': { L: history.map(marshalEvent) },
        ':pab': { L: pendingAddBacks.map(marshalPendingAddBack) },
      },
    }));
  } else {
    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        PK: { S: `GROG#${groupId}` },
        SK: { S: 'METADATA' },
      },
      UpdateExpression: 'SET entries = :entries, history = :history',
      ExpressionAttributeValues: {
        ':entries': { L: entries.map(marshalEntry) },
        ':history': { L: history.map(marshalEvent) },
      },
    }));
  }
}

async function writePendingAddBacksOnly(
  groupId: string,
  pendingAddBacks: PendingAddBack[],
): Promise<void> {
  await dynamo.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROG#${groupId}` },
      SK: { S: 'METADATA' },
    },
    UpdateExpression: 'SET pendingAddBacks = :pab',
    ExpressionAttributeValues: {
      ':pab': { L: pendingAddBacks.map(marshalPendingAddBack) },
    },
  }));
}


// ── Handlers ──────────────────────────────────────────────────────────────────

async function initializeGrog(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, bottleSize, seedEntries = [] } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (bottleSize == null || bottleSize <= 0) err('INVALID_BOTTLE_SIZE');

  if (!(await isAdmin(groupId, callerId))) err('UNAUTHORIZED');

  if (!validateSeedEntries(seedEntries, bottleSize)) err('SEED_OVERFLOW');

  const now = new Date().toISOString();
  const ids = seedEntries.map(() => ({ entryId: randomUUID(), eventId: randomUUID() }));
  const { entries, history } = buildInitialGrog(seedEntries, callerId, now, ids);

  await dynamo.send(new PutItemCommand({
    TableName: TABLE,
    Item: {
      PK: { S: `GROG#${groupId}` },
      SK: { S: 'METADATA' },
      groupId: { S: groupId },
      bottleSize: { N: String(bottleSize) },
      entries: { L: entries.map(marshalEntry) },
      history: { L: history.map(marshalEvent) },
      pendingAddBacks: { L: [] },
      createdAt: { S: now },
      createdBy: { S: callerId },
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));

  return { groupId, bottleSize, entries, history, pendingAddBacks: [] };
}

async function addLiquorToGrog(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, category, brand } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!category) err('MISSING_CATEGORY');
  if (!brand || !brand.trim()) err('MISSING_BRAND');

  if (!(await isAdmin(groupId, callerId))) err('UNAUTHORIZED');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const entries = applyAddLiquor(grog.entries, { category, brand }, randomUUID());
  const history: GrogHistoryEvent[] = [
    ...grog.history,
    makeAdditionEvent({ category, brand }, callerId, randomUUID(), new Date().toISOString()),
  ];

  await writeGrog(groupId, entries, history);
  return { groupId, bottleSize: grog.bottleSize, entries, history, pendingAddBacks: grog.pendingAddBacks };
}

async function removeLiquorFromGrog(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, entryId } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!entryId) err('MISSING_ENTRY_ID');

  if (!(await isAdmin(groupId, callerId))) err('UNAUTHORIZED');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const entries = applyRemoveLiquor(grog.entries, entryId);
  if (entries === null) err('ENTRY_NOT_FOUND');

  await writeGrog(groupId, entries, grog.history);
  return { groupId, bottleSize: grog.bottleSize, entries, history: grog.history, pendingAddBacks: grog.pendingAddBacks };
}

async function adjustGrogEntry(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, entryId, amountMl } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!entryId) err('MISSING_ENTRY_ID');
  if (amountMl == null || amountMl < 0) err('INVALID_AMOUNT');

  if (!(await isAdmin(groupId, callerId))) err('UNAUTHORIZED');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const idx = grog.entries.findIndex(e => e.entryId === entryId);
  if (idx === -1) err('ENTRY_NOT_FOUND');

  let entries: GrogEntry[];
  if (amountMl === 0) {
    entries = grog.entries.filter(e => e.entryId !== entryId);
  } else {
    entries = grog.entries.map(e =>
      e.entryId === entryId ? { ...e, amountMl } : e
    );
  }

  await writeGrog(groupId, entries, grog.history);
  return { groupId, bottleSize: grog.bottleSize, entries, history: grog.history, pendingAddBacks: grog.pendingAddBacks };
}

async function confirmGrogDelivery(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, debtId, addBack } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!debtId) err('MISSING_DEBT_ID');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const now = new Date().toISOString();
  const [entries, history] = applyConfirmDelivery(
    grog.entries,
    grog.history,
    callerId,
    debtId,
    now,
    randomUUID(),
    addBack,
    addBack ? randomUUID() : undefined,
    addBack ? randomUUID() : undefined,
  );

  await writeGrog(groupId, entries, history);
  return { groupId, bottleSize: grog.bottleSize, entries, history, pendingAddBacks: grog.pendingAddBacks };
}

async function takeGrogShot(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, debtId } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!debtId) err('MISSING_DEBT_ID');

  // Fetch DEBT item to verify status, punishment, and get creditorId + createdAt
  const debtResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `DEBT#${debtId}` },
    },
  }));
  if (!debtResult.Item) err('DEBT_NOT_FOUND');

  const debt = debtResult.Item;
  const debtStatus = debt.status?.S ?? '';
  const debtPunishment = debt.debtPunishment?.S ?? '';
  const debtorId = debt.debtorId?.S ?? '';
  const creditorId = debt.creditorId?.S ?? '';
  const debtCreatedAt = debt.createdAt?.S ?? '';

  if (debtStatus !== 'resolved') err('INVALID_DEBT_STATUS');
  if (debtPunishment !== 'infinity_grog') err('INVALID_DEBT_PUNISHMENT');
  if (callerId !== debtorId) err('UNAUTHORIZED');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const now = new Date().toISOString();
  const shotEventId = randomUUID();
  const [newEntries, newHistory, newPendingAddBacks] = applyTakeGrogShot(
    grog.entries,
    grog.history,
    grog.pendingAddBacks,
    debtorId,
    debtId,
    now,
    shotEventId,
  );

  const debtSk = `DEBT#${debtCreatedAt}#${debtId}`;

  // Atomic TransactWrite: GROG + DEBT + 2× PLAYERDEBT
  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE,
          Key: {
            PK: { S: `GROG#${groupId}` },
            SK: { S: 'METADATA' },
          },
          UpdateExpression: 'SET entries = :entries, history = :history, pendingAddBacks = :pab',
          ExpressionAttributeValues: {
            ':entries': { L: newEntries.map(marshalEntry) },
            ':history': { L: newHistory.map(marshalEvent) },
            ':pab': { L: newPendingAddBacks.map(marshalPendingAddBack) },
          },
        },
      },
      {
        Update: {
          TableName: TABLE,
          Key: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `DEBT#${debtId}` },
          },
          UpdateExpression: 'SET #status = :delivered, deliveredAt = :now, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':delivered': { S: 'delivered' },
            ':now': { S: now },
            ':gsi2pk': { S: `GROUP#${groupId}#STATUS#delivered` },
            ':gsi2sk': { S: debtSk },
          },
        },
      },
      {
        Update: {
          TableName: TABLE,
          Key: {
            PK: { S: `PLAYERDEBT#${debtorId}#GROUP#${groupId}` },
            SK: { S: debtSk },
          },
          UpdateExpression: 'SET #s = :s',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': { S: 'delivered' } },
        },
      },
      {
        Update: {
          TableName: TABLE,
          Key: {
            PK: { S: `PLAYERDEBT#${creditorId}#GROUP#${groupId}` },
            SK: { S: debtSk },
          },
          UpdateExpression: 'SET #s = :s',
          ExpressionAttributeNames: { '#s': 'status' },
          ExpressionAttributeValues: { ':s': { S: 'delivered' } },
        },
      },
    ],
  }));

  // Best-effort: write slap_delivered FEED entry
  try {
    const feedEntryId = randomUUID();
    await dynamo.send(new PutItemCommand({
      TableName: TABLE,
      Item: {
        PK: { S: `GROUP#${groupId}` },
        SK: { S: `FEED#${now}#${feedEntryId}` },
        entryId: { S: feedEntryId },
        groupId: { S: groupId },
        type: { S: 'slap_delivered' },
        refId: { S: debtId },
        actorId: { S: callerId },
        // summary is the pre-detail fallback; the client prefers the fields
        // below. The shot is taken by the debtor, hence callerId === debtorId.
        summary: { S: 'A grog shot was taken' },
        statement: { S: debt.statement?.S ?? '' },
        debtorId: { S: debtorId },
        creditorId: { S: creditorId },
        punishment: { S: 'infinity_grog' },
        amountMl: { N: String(SHOT_ML) },
        readInOnly: { BOOL: false },
        createdAt: { S: now },
      },
    }));
  } catch (feedErr) {
    console.error('[grog-resolver] takeGrogShot: failed to write FEED entry:', feedErr);
  }

  // Best-effort: send push notification via SNS
  if (SNS_TOPIC_ARN) {
    try {
      await sns.send(new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Message: JSON.stringify({
          type: 'slap_delivered',
          groupId,
          debtId,
          actorId: callerId,
        }),
      }));
    } catch (snsErr) {
      console.error('[grog-resolver] takeGrogShot: failed to send SNS notification:', snsErr);
    }
  }

  return {
    groupId,
    bottleSize: grog.bottleSize,
    entries: newEntries,
    history: newHistory,
    pendingAddBacks: newPendingAddBacks,
  };
}


async function redeemAddBack(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, debtId, category, brand } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!debtId) err('MISSING_DEBT_ID');
  if (!category) err('MISSING_CATEGORY');
  if (!brand || !brand.trim()) err('MISSING_BRAND');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  // Find the pending add-back to verify authorization
  const pendingEntry = grog.pendingAddBacks.find(p => p.debtId === debtId);
  if (!pendingEntry) err('PENDING_ADD_BACK_NOT_FOUND');

  // Caller must be the debtor for this debtId or an admin
  const callerIsDebtor = callerId === pendingEntry.debtorId;
  const callerIsAdmin = await isAdmin(groupId, callerId);
  if (!callerIsDebtor && !callerIsAdmin) err('UNAUTHORIZED');

  const now = new Date().toISOString();
  const result = applyRedeemAddBack(
    grog.entries,
    grog.history,
    grog.pendingAddBacks,
    debtId,
    { category, brand },
    callerId,
    now,
    randomUUID(),
    randomUUID(),
  );
  if (result === null) err('PENDING_ADD_BACK_NOT_FOUND');

  const [newEntries, newHistory, newPendingAddBacks] = result;

  await writeGrog(groupId, newEntries, newHistory, newPendingAddBacks);
  return { groupId, bottleSize: grog.bottleSize, entries: newEntries, history: newHistory, pendingAddBacks: newPendingAddBacks };
}

async function clearAddBack(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, debtId } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!debtId) err('MISSING_DEBT_ID');

  if (!(await isAdmin(groupId, callerId))) err('UNAUTHORIZED');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const newPendingAddBacks = applyClearAddBack(grog.pendingAddBacks, debtId);
  if (newPendingAddBacks === null) err('PENDING_ADD_BACK_NOT_FOUND');

  await writePendingAddBacksOnly(groupId, newPendingAddBacks);
  return { groupId, bottleSize: grog.bottleSize, entries: grog.entries, history: grog.history, pendingAddBacks: newPendingAddBacks };
}

async function adminAddBack(callerId: string, args: Args): Promise<GrogItem> {
  const { groupId, debtId, category, brand } = args;
  if (!groupId) err('MISSING_GROUP_ID');
  if (!debtId) err('MISSING_DEBT_ID');
  if (!category) err('MISSING_CATEGORY');
  if (!brand || !brand.trim()) err('MISSING_BRAND');

  if (!(await isAdmin(groupId, callerId))) err('UNAUTHORIZED');

  const grog = await fetchGrog(groupId);
  if (!grog) err('GROG_NOT_FOUND');

  const now = new Date().toISOString();
  const result = applyRedeemAddBack(
    grog.entries,
    grog.history,
    grog.pendingAddBacks,
    debtId,
    { category, brand },
    callerId,
    now,
    randomUUID(),
    randomUUID(),
  );
  if (result === null) err('PENDING_ADD_BACK_NOT_FOUND');

  const [newEntries, newHistory, newPendingAddBacks] = result;

  await writeGrog(groupId, newEntries, newHistory, newPendingAddBacks);
  return { groupId, bottleSize: grog.bottleSize, entries: newEntries, history: newHistory, pendingAddBacks: newPendingAddBacks };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export const handler: AppSyncResolverHandler<Args, unknown> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const callerId = identity?.sub;
  if (!callerId) err('UNAUTHORIZED');

  const fieldName = event.info.fieldName;
  const args = event.arguments;

  try {
    switch (fieldName) {
      case 'initializeGrog':
        return await initializeGrog(callerId, args);
      case 'addLiquorToGrog':
        return await addLiquorToGrog(callerId, args);
      case 'removeLiquorFromGrog':
        return await removeLiquorFromGrog(callerId, args);
      case 'adjustGrogEntry':
        return await adjustGrogEntry(callerId, args);
      case 'confirmGrogDelivery':
        return await confirmGrogDelivery(callerId, args);
      case 'takeGrogShot':
        return await takeGrogShot(callerId, args);
      case 'redeemAddBack':
        return await redeemAddBack(callerId, args);
      case 'clearAddBack':
        return await clearAddBack(callerId, args);
      case 'adminAddBack':
        return await adminAddBack(callerId, args);
      default:
        err(`UNKNOWN_FIELD: ${fieldName}`);
    }
  } catch (e) {
    console.error('[grog-resolver] error:', e);
    throw e;
  }
};

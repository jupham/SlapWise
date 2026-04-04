import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
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
} from './logic';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

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

function marshalGrog(item: Record<string, AttributeValue>): GrogItem {
  const entries = (item.entries?.L ?? []).map(v =>
    unmarshalEntry(v.M as Record<string, AttributeValue>)
  );
  const history = (item.history?.L ?? []).map(v =>
    unmarshalEvent(v.M as Record<string, AttributeValue>)
  );
  return {
    groupId: item.groupId?.S ?? '',
    bottleSize: Number(item.bottleSize?.N ?? 0),
    entries,
    history,
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

async function writeGrog(groupId: string, entries: GrogEntry[], history: GrogHistoryEvent[]): Promise<void> {
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
      createdAt: { S: now },
      createdBy: { S: callerId },
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  }));

  return { groupId, bottleSize, entries, history };
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
  return { groupId, bottleSize: grog.bottleSize, entries, history };
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
  return { groupId, bottleSize: grog.bottleSize, entries, history: grog.history };
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
  return { groupId, bottleSize: grog.bottleSize, entries, history: grog.history };
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
  return { groupId, bottleSize: grog.bottleSize, entries, history };
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
      default:
        err(`UNKNOWN_FIELD: ${fieldName}`);
    }
  } catch (e) {
    console.error('[grog-resolver] error:', e);
    throw e;
  }
};

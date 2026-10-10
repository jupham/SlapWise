import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import { publishNotification } from '../shared/notifications';
import {
  answerPermission,
  awaitingAnswers,
  settleGameCall,
  validateCalledPlayers,
  type GameCallAnswer,
} from './logic';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

type Item = Record<string, AttributeValue>;

interface AppSyncCognitoIdentity {
  sub: string;
  [key: string]: unknown;
}

interface GameCall {
  callId: string;
  groupId: string;
  callerId: string;
  calledPlayerIds: string[];
  answers: { playerId: string; answer: GameCallAnswer; answeredBy: string | null }[];
  status: 'open' | 'settled';
  chuggerIds: string[] | null;
  backfired: boolean | null;
  createdAt: string;
  settledAt: string | null;
}

function err(code: string): never {
  throw new Error(code);
}

const strings = (v: AttributeValue | undefined): string[] => (v?.L ?? []).map((x) => x.S!).filter(Boolean);
const stringList = (ids: string[]): AttributeValue => ({ L: ids.map((S) => ({ S })) });

/**
 * Each answer is `{ answer, by }`, where `by` is whoever recorded it — the
 * player themselves, or the caller answering for them. A bare string is an
 * answer recorded before `by` existed.
 */
function answerEntries(item: Item): Record<string, { answer: GameCallAnswer; by: string | null }> {
  const out: Record<string, { answer: GameCallAnswer; by: string | null }> = {};
  for (const [id, v] of Object.entries(item.answers?.M ?? {})) {
    out[id] = v.M
      ? { answer: v.M.answer.S as GameCallAnswer, by: v.M.by?.S ?? null }
      : { answer: v.S as GameCallAnswer, by: null };
  }
  return out;
}

function answersOf(item: Item): Record<string, GameCallAnswer> {
  return Object.fromEntries(Object.entries(answerEntries(item)).map(([id, e]) => [id, e.answer]));
}

function toGameCall(item: Item): GameCall {
  const answers = answerEntries(item);
  const called = strings(item.calledPlayerIds);
  return {
    callId: item.callId.S!,
    groupId: item.groupId.S!,
    callerId: item.callerId.S!,
    calledPlayerIds: called,
    // In call order rather than map order, so the screen lists people stably.
    answers: called
      .filter((id) => id in answers)
      .map((playerId) => ({ playerId, answer: answers[playerId].answer, answeredBy: answers[playerId].by })),
    status: item.status.S as 'open' | 'settled',
    chuggerIds: item.chuggerIds ? strings(item.chuggerIds) : null,
    backfired: item.backfired?.BOOL ?? null,
    createdAt: item.createdAt.S!,
    settledAt: item.settledAt?.S ?? null,
  };
}

/** The caller's Member row, refusing anyone who is not a read-in member. */
async function requireReadIn(groupId: string, playerId: string): Promise<void> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `MEMBER#${playerId}` } },
  }));
  if (!result.Item) err('UNAUTHORIZED');
  if (!result.Item.isReadIn?.BOOL) err('NOT_READ_IN');
}

async function readInPlayerIds(groupId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let lastKey: Item | undefined;
  do {
    const page = await dynamo.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': { S: `GROUP#${groupId}` }, ':sk': { S: 'MEMBER#' } },
      ExclusiveStartKey: lastKey,
    }));
    for (const m of page.Items ?? []) if (m.isReadIn?.BOOL && m.playerId?.S) ids.add(m.playerId.S);
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return ids;
}

async function getCallItem(groupId: string, callId: string): Promise<Item> {
  const result = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `GAMECALL#${callId}` } },
    ConsistentRead: true,
  }));
  if (!result.Item) err('GAME_CALL_NOT_FOUND');
  return result.Item;
}

// ── callGame ──────────────────────────────────────────────────────────────────

async function callGame(callerId: string, args: { groupId: string; calledPlayerIds: string[] }): Promise<GameCall> {
  const { groupId } = args;
  await requireReadIn(groupId, callerId);

  const checked = validateCalledPlayers(callerId, args.calledPlayerIds ?? [], await readInPlayerIds(groupId));
  if (!checked.ok) err(checked.code);
  const called = checked.calledPlayerIds;

  const callId = randomUUID();
  const entryId = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `GAMECALL#${callId}` },
            callId: { S: callId },
            groupId: { S: groupId },
            callerId: { S: callerId },
            calledPlayerIds: stringList(called),
            answers: { M: {} },
            status: { S: 'open' },
            createdAt: { S: now },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      // readInOnly: getFeed hands everyone else a redacted copy of this row.
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `FEED#${now}#${entryId}` },
            entryId: { S: entryId },
            groupId: { S: groupId },
            type: { S: 'game_called' },
            refId: { S: callId },
            actorId: { S: callerId },
            summary: { S: 'Game was called' },
            readInOnly: { BOOL: true },
            calledPlayerIds: stringList(called),
            createdAt: { S: now },
          },
        },
      },
    ],
  }));

  // Only the people called — it is their move. Everyone else finds out when it
  // settles, or not at all if they are not read in.
  await publishNotification({
    type: 'game_called',
    groupId,
    audience: { kind: 'players', playerIds: called },
    actorId: callerId,
    callId,
  });

  return toGameCall(await getCallItem(groupId, callId));
}

// ── respondToGameCall ─────────────────────────────────────────────────────────

async function respondToGameCall(
  actorId: string,
  args: { groupId: string; callId: string; covered: boolean; playerId?: string | null }
): Promise<GameCall> {
  const { groupId, callId } = args;
  // Whose answer this is. Omitted means your own; the caller may name anyone called.
  const playerId = args.playerId ?? actorId;
  const before = await getCallItem(groupId, callId);

  if (before.status.S !== 'open') err('GAME_CALL_SETTLED');
  const denied = answerPermission(actorId, before.callerId.S!, strings(before.calledPlayerIds), playerId);
  if (denied) err(denied);
  if (playerId in answersOf(before)) err('ALREADY_ANSWERED');

  const answer: GameCallAnswer = args.covered ? 'covered' : 'not_covered';

  // The checks above give a useful error; the condition is what makes them
  // hold against a double tap or a settle racing in between.
  let after: Item;
  try {
    const result = await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `GAMECALL#${callId}` } },
      UpdateExpression: 'SET answers.#me = :answer',
      ConditionExpression: '#status = :open AND attribute_not_exists(answers.#me)',
      ExpressionAttributeNames: { '#me': playerId, '#status': 'status' },
      ExpressionAttributeValues: {
        ':answer': { M: { answer: { S: answer }, by: { S: actorId } } },
        ':open': { S: 'open' },
      },
      ReturnValues: 'ALL_NEW',
    }));
    after = result.Attributes!;
  } catch (e) {
    if ((e as { name?: string }).name === 'ConditionalCheckFailedException') err('ALREADY_ANSWERED');
    throw e;
  }

  const callerId = after.callerId.S!;
  const called = strings(after.calledPlayerIds);
  const answers = answersOf(after);
  if (awaitingAnswers(called, answers).length > 0) return toGameCall(after);

  // Last answer in: settle. Two final answers landing together would both get
  // here, so the status condition lets exactly one of them write the outcome.
  const { chuggerIds, backfired } = settleGameCall(callerId, called, answers);
  const entryId = randomUUID();
  const now = new Date().toISOString();
  try {
    await dynamo.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `GAMECALL#${callId}` } },
            UpdateExpression: 'SET #status = :settled, chuggerIds = :chuggers, backfired = :backfired, settledAt = :now',
            ConditionExpression: '#status = :open',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':settled': { S: 'settled' },
              ':open': { S: 'open' },
              ':chuggers': stringList(chuggerIds),
              ':backfired': { BOOL: backfired },
              ':now': { S: now },
            },
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              PK: { S: `GROUP#${groupId}` },
              SK: { S: `FEED#${now}#${entryId}` },
              entryId: { S: entryId },
              groupId: { S: groupId },
              type: { S: 'game_settled' },
              refId: { S: callId },
              actorId: { S: callerId },
              summary: { S: 'Game was settled' },
              readInOnly: { BOOL: true },
              calledPlayerIds: stringList(called),
              chuggerIds: stringList(chuggerIds),
              createdAt: { S: now },
            },
          },
        },
      ],
    }));
  } catch (e) {
    // Someone else's final answer settled it first; theirs is the same outcome.
    if ((e as { name?: string }).name !== 'TransactionCanceledException') throw e;
    return toGameCall(await getCallItem(groupId, callId));
  }

  await publishNotification({
    type: 'game_settled',
    groupId,
    audience: { kind: 'players', playerIds: [callerId, ...called] },
    actorId: callerId,
    callId,
    chuggerIds,
  });

  return toGameCall(await getCallItem(groupId, callId));
}

// ── getGameCalls ──────────────────────────────────────────────────────────────

async function getGameCalls(playerId: string, args: { groupId: string }): Promise<GameCall[]> {
  await requireReadIn(args.groupId, playerId);

  const calls: GameCall[] = [];
  let lastKey: Item | undefined;
  do {
    const page = await dynamo.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': { S: `GROUP#${args.groupId}` }, ':sk': { S: 'GAMECALL#' } },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of page.Items ?? []) calls.push(toGameCall(item));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return calls;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Every field here is read-in only, and the gate is enforced here rather than
 * by hiding buttons: getGameCalls returns full details, so a non-read-in client
 * that asked would otherwise simply be told.
 */
export const handler: AppSyncResolverHandler<Record<string, unknown>, unknown> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const playerId = identity?.sub;
  if (!playerId) err('UNAUTHORIZED');

  const args = event.arguments as never;
  switch (event.info.fieldName) {
    case 'callGame':
      return callGame(playerId, args);
    case 'respondToGameCall':
      return respondToGameCall(playerId, args);
    case 'getGameCalls':
      return getGameCalls(playerId, args);
    default:
      err(`UNKNOWN_FIELD: ${event.info.fieldName}`);
  }
};

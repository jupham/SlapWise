import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

interface Args {
  groupId: string;
  statementMakerId: string;
  statement: string;
}

interface AppSyncCognitoIdentity {
  sub: string;
  username?: string;
  [key: string]: unknown;
}

function err(code: string): never {
  throw new Error(code);
}

export const handler: AppSyncResolverHandler<Args, unknown> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const callerId = identity?.sub;
  if (!callerId) err('UNAUTHORIZED');

  const { groupId, statementMakerId, statement } = event.arguments;

  if (callerId === statementMakerId) err('SELF_CHALLENGE_ERROR');
  if (!statement || statement.trim() === '') err('VALIDATION_ERROR');

  const debtId = randomUUID();
  const entryId = randomUUID();
  const now = new Date().toISOString();
  const challengerId = callerId!;

  // GSI2SK includes createdAt for chronological ordering
  const gsi2sk = `DEBT#${now}#${debtId}`;

  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      // 1. Main debt item
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `DEBT#${debtId}` },
            debtId: { S: debtId },
            groupId: { S: groupId },
            gameType: { S: 'manchester' },
            status: { S: 'pending' },
            challengerId: { S: challengerId },
            statementMakerId: { S: statementMakerId },
            statement: { S: statement },
            createdAt: { S: now },
            debtorDeliveryConfirmed: { BOOL: false },
            creditorDeliveryConfirmed: { BOOL: false },
            GSI2PK: { S: `GROUP#${groupId}#STATUS#pending` },
            GSI2SK: { S: gsi2sk },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      // 2. GSI4 index item for challenger (denormalized)
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `PLAYERDEBT#${challengerId}#GROUP#${groupId}` },
            SK: { S: `DEBT#${now}#${debtId}` },
            GSI4PK: { S: `PLAYER#${challengerId}#GROUP#${groupId}` },
            GSI4SK: { S: `DEBT#${now}#${debtId}` },
            debtId: { S: debtId },
            groupId: { S: groupId },
            playerId: { S: challengerId },
            role: { S: 'challenger' },
            status: { S: 'pending' },
            gameType: { S: 'manchester' },
            statement: { S: statement },
            challengerId: { S: challengerId },
            statementMakerId: { S: statementMakerId },
            debtorId: { NULL: true },
            creditorId: { NULL: true },
            debtPunishment: { NULL: true },
            createdAt: { S: now },
          },
        },
      },
      // 3. GSI4 index item for statement maker (denormalized)
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `PLAYERDEBT#${statementMakerId}#GROUP#${groupId}` },
            SK: { S: `DEBT#${now}#${debtId}` },
            GSI4PK: { S: `PLAYER#${statementMakerId}#GROUP#${groupId}` },
            GSI4SK: { S: `DEBT#${now}#${debtId}` },
            debtId: { S: debtId },
            groupId: { S: groupId },
            playerId: { S: statementMakerId },
            role: { S: 'statementMaker' },
            status: { S: 'pending' },
            gameType: { S: 'manchester' },
            statement: { S: statement },
            challengerId: { S: challengerId },
            statementMakerId: { S: statementMakerId },
            debtorId: { NULL: true },
            creditorId: { NULL: true },
            debtPunishment: { NULL: true },
            createdAt: { S: now },
          },
        },
      },
      // 4. Feed entry
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `FEED#${now}#${entryId}` },
            entryId: { S: entryId },
            groupId: { S: groupId },
            type: { S: 'manchester_created' },
            refId: { S: debtId },
            actorId: { S: challengerId },
            // summary is the pre-detail fallback for entries written before the
            // structured fields existed; the client prefers the fields below.
            summary: { S: `Manchester called on a statement` },
            statement: { S: statement },
            challengerId: { S: challengerId },
            statementMakerId: { S: statementMakerId },
            readInOnly: { BOOL: false },
            createdAt: { S: now },
          },
        },
      },
    ],
  }));

  return {
    __typename: 'SlapDebt',
    debtId,
    groupId,
    gameType: 'manchester',
    status: 'pending',
    challengerId,
    statementMakerId,
    statement,
    createdAt: now,
    debtorDeliveryConfirmed: false,
    creditorDeliveryConfirmed: false,
    debtorId: null,
    creditorId: null,
    resolvedAt: null,
    deliveredAt: null,
    challengerConfirmation: null,
    statementMakerConfirmation: null,
    debtPunishment: null,
  };
};

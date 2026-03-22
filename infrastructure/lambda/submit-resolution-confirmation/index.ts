import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

type ResolutionOutcome = 'followed_through' | 'did_not_follow_through';
type PunishmentType = 'slap' | 'infinity_grog';

interface Args {
  debtId: string;
  groupId: string;
  outcome: ResolutionOutcome;
  punishment: PunishmentType;
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

  const { debtId, groupId, outcome, punishment } = event.arguments;

  // 1. Fetch the debt item
  const debtResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `DEBT#${debtId}` },
    },
  }));

  const debt = debtResult.Item;
  if (!debt) err('DEBT_NOT_FOUND');

  // 2. Validate caller is a group member
  const memberResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `MEMBER#${callerId}` },
    },
  }));
  if (!memberResult.Item) err('UNAUTHORIZED');

  // 3. Validate caller is challenger or statementMaker
  const challengerId = debt.challengerId?.S ?? null;
  const statementMakerId = debt.statementMakerId?.S ?? null;
  if (callerId !== challengerId && callerId !== statementMakerId) err('UNAUTHORIZED');

  // 4. Validate debt is not terminal
  const status = debt.status?.S ?? '';
  if (['resolved', 'delivered'].includes(status)) err('DEBT_ALREADY_TERMINAL');

  const now = new Date().toISOString();
  const createdAt = debt.createdAt?.S ?? now;
  const gsi2sk = `DEBT#${createdAt}#${debtId}`;

  // 5. First confirmation — status is 'pending'
  if (status === 'pending') {
    const isChallenger = callerId === challengerId;
    const confirmationField = isChallenger ? 'challengerConfirmation' : 'statementMakerConfirmation';

    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        PK: { S: `GROUP#${groupId}` },
        SK: { S: `DEBT#${debtId}` },
      },
      UpdateExpression: 'SET #conf = :conf, #status = :newStatus, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
      ConditionExpression: 'attribute_not_exists(#conf) OR attribute_type(#conf, :nullType)',
      ExpressionAttributeNames: {
        '#conf': confirmationField,
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':conf': {
          M: {
            outcome: { S: outcome },
            punishment: { S: punishment },
            submittedAt: { S: now },
          },
        },
        ':newStatus': { S: 'pending_confirmation' },
        ':gsi2pk': { S: `GROUP#${groupId}#STATUS#pending_confirmation` },
        ':gsi2sk': { S: gsi2sk },
        ':nullType': { S: 'NULL' },
      },
    }));

    // Update both GSI4 status fields
    await updateGsi4Status(groupId, debtId, createdAt, challengerId!, statementMakerId!, 'pending_confirmation', null);

    const updated = await dynamo.send(new GetItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `DEBT#${debtId}` } },
    }));
    return marshalDebt(updated.Item!);
  }

  // 6. Second confirmation — status is 'pending_confirmation'
  if (status === 'pending_confirmation') {
    const isChallenger = callerId === challengerId;
    const myField = isChallenger ? 'challengerConfirmation' : 'statementMakerConfirmation';
    const otherField = isChallenger ? 'statementMakerConfirmation' : 'challengerConfirmation';

    const otherConfirmation = debt[otherField]?.M;
    const otherOutcome = otherConfirmation?.outcome?.S as ResolutionOutcome | undefined;
    if (otherOutcome === undefined) err('INVALID_STATE');

    // Second party agrees with first party's outcome
    const resolvedOutcome = otherOutcome!;
    let debtorId: string;
    let creditorId: string;

    if (resolvedOutcome === 'followed_through') {
      // Challenger followed through → challenger is debtor (owes punishment)
      debtorId = challengerId!;
      creditorId = statementMakerId!;
    } else {
      // Statement maker didn't follow through → statement maker is debtor
      debtorId = statementMakerId!;
      creditorId = challengerId!;
    }

    // Punishment is the one the debtor submitted
    const debtorPunishment: PunishmentType =
      debtorId === callerId
        ? punishment
        : (otherConfirmation?.punishment?.S as PunishmentType);

    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        PK: { S: `GROUP#${groupId}` },
        SK: { S: `DEBT#${debtId}` },
      },
      UpdateExpression:
        'SET #myConf = :myConf, #status = :newStatus, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk, ' +
        'debtorId = :debtorId, creditorId = :creditorId, resolvedAt = :resolvedAt, debtPunishment = :debtPunishment',
      ConditionExpression: '#status = :pendingConf',
      ExpressionAttributeNames: {
        '#myConf': myField,
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':myConf': { M: { outcome: { S: resolvedOutcome }, punishment: { S: punishment }, submittedAt: { S: now } } },
        ':newStatus': { S: 'resolved' },
        ':pendingConf': { S: 'pending_confirmation' },
        ':gsi2pk': { S: `GROUP#${groupId}#STATUS#resolved` },
        ':gsi2sk': { S: gsi2sk },
        ':debtorId': { S: debtorId },
        ':creditorId': { S: creditorId },
        ':resolvedAt': { S: now },
        ':debtPunishment': { S: debtorPunishment },
      },
    }));

    // Update GSI4 items with resolved status + resolution fields
    await updateGsi4Status(groupId, debtId, createdAt, challengerId!, statementMakerId!, 'resolved', {
      debtorId,
      creditorId,
      debtPunishment: debtorPunishment,
    });

    // Write feed entry for resolution
    const entryId = randomUUID();
    await dynamo.send(new TransactWriteItemsCommand({
      TransactItems: [{
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `FEED#${now}#${entryId}` },
            entryId: { S: entryId },
            groupId: { S: groupId },
            type: { S: 'manchester_resolved' },
            refId: { S: debtId },
            actorId: { S: callerId! },
            summary: { S: `A Manchester was resolved` },
            readInOnly: { BOOL: false },
            createdAt: { S: now },
          },
        },
      }],
    }));

    const updated = await dynamo.send(new GetItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `DEBT#${debtId}` } },
    }));
    return marshalDebt(updated.Item!);
  }

  err('INVALID_STATE');
};

interface ResolutionFields {
  debtorId: string;
  creditorId: string;
  debtPunishment: string;
}

async function updateGsi4Status(
  groupId: string,
  debtId: string,
  createdAt: string,
  challengerId: string,
  statementMakerId: string,
  newStatus: string,
  resolution: ResolutionFields | null
): Promise<void> {
  const sk = `DEBT#${createdAt}#${debtId}`;

  let updateExpr = 'SET #s = :s';
  const exprNames: Record<string, string> = { '#s': 'status' };
  const exprValues: Record<string, AttributeValue> = { ':s': { S: newStatus } };

  if (resolution) {
    updateExpr += ', debtorId = :debtorId, creditorId = :creditorId, debtPunishment = :debtPunishment';
    exprValues[':debtorId'] = { S: resolution.debtorId };
    exprValues[':creditorId'] = { S: resolution.creditorId };
    exprValues[':debtPunishment'] = { S: resolution.debtPunishment };
  }

  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE,
          Key: {
            PK: { S: `PLAYERDEBT#${challengerId}#GROUP#${groupId}` },
            SK: { S: sk },
          },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: exprNames,
          ExpressionAttributeValues: exprValues,
        },
      },
      {
        Update: {
          TableName: TABLE,
          Key: {
            PK: { S: `PLAYERDEBT#${statementMakerId}#GROUP#${groupId}` },
            SK: { S: sk },
          },
          UpdateExpression: updateExpr,
          ExpressionAttributeNames: exprNames,
          ExpressionAttributeValues: exprValues,
        },
      },
    ],
  }));
}

function marshalConfirmation(m: Record<string, { S?: string }> | undefined) {
  if (!m) return null;
  return {
    outcome: m.outcome?.S ?? null,
    punishment: m.punishment?.S ?? null,
    submittedAt: m.submittedAt?.S ?? null,
  };
}

function marshalDebt(item: Record<string, {
  S?: string;
  BOOL?: boolean;
  NULL?: boolean;
  M?: Record<string, { S?: string }>;
}>) {
  return {
    __typename: 'SlapDebt',
    debtId: item.debtId?.S,
    groupId: item.groupId?.S,
    gameType: item.gameType?.S,
    status: item.status?.S,
    challengerId: item.challengerId?.S ?? null,
    statementMakerId: item.statementMakerId?.S ?? null,
    statement: item.statement?.S ?? null,
    debtorId: item.debtorId?.S ?? null,
    creditorId: item.creditorId?.S ?? null,
    debtPunishment: item.debtPunishment?.S ?? null,
    challengerConfirmation: marshalConfirmation(item.challengerConfirmation?.M),
    statementMakerConfirmation: marshalConfirmation(item.statementMakerConfirmation?.M),
    debtorDeliveryConfirmed: item.debtorDeliveryConfirmed?.BOOL ?? false,
    creditorDeliveryConfirmed: item.creditorDeliveryConfirmed?.BOOL ?? false,
    createdAt: item.createdAt?.S,
    resolvedAt: item.resolvedAt?.S ?? null,
    deliveredAt: item.deliveredAt?.S ?? null,
  };
}

import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';
import { publishNotification } from '../shared/notifications';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

interface Args {
  debtId: string;
  groupId: string;
}

interface AppSyncCognitoIdentity {
  sub: string;
  [key: string]: unknown;
}

function err(code: string): never {
  throw new Error(code);
}

export const handler: AppSyncResolverHandler<Args, unknown> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const callerId = identity?.sub;
  if (!callerId) err('UNAUTHORIZED');

  const { debtId, groupId } = event.arguments;

  const debtResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `DEBT#${debtId}` },
    },
  }));

  const debt = debtResult.Item;
  if (!debt) err('DEBT_NOT_FOUND');

  const status = debt.status?.S ?? '';
  if (status !== 'resolved') err('DEBT_NOT_RESOLVED');

  const debtorId = debt.debtorId?.S ?? null;
  const creditorId = debt.creditorId?.S ?? null;
  if (callerId !== debtorId && callerId !== creditorId) err('UNAUTHORIZED');

  const isDebtor = callerId === debtorId;
  const myField = isDebtor ? 'debtorDeliveryConfirmed' : 'creditorDeliveryConfirmed';
  const alreadyConfirmed = isDebtor
    ? (debt.debtorDeliveryConfirmed?.BOOL ?? false)
    : (debt.creditorDeliveryConfirmed?.BOOL ?? false);

  if (alreadyConfirmed) err('ALREADY_CONFIRMED');

  await dynamo.send(new UpdateItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `DEBT#${debtId}` },
    },
    UpdateExpression: 'SET #myField = :true',
    ConditionExpression: 'attribute_not_exists(#myField) OR #myField = :false',
    ExpressionAttributeNames: { '#myField': myField },
    ExpressionAttributeValues: {
      ':true': { BOOL: true },
      ':false': { BOOL: false },
    },
  }));

  // Re-fetch to check if both confirmed
  const refetch = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `DEBT#${debtId}` } },
  }));

  const updated = refetch.Item!;
  const debtorConfirmed = updated.debtorDeliveryConfirmed?.BOOL ?? false;
  const creditorConfirmed = updated.creditorDeliveryConfirmed?.BOOL ?? false;

  if (debtorConfirmed && creditorConfirmed) {
    const now = new Date().toISOString();
    const createdAt = updated.createdAt?.S ?? now;
    const challengerId = updated.challengerId?.S!;
    const statementMakerId = updated.statementMakerId?.S!;
    const entryId = randomUUID();
    const gsi2sk = `DEBT#${createdAt}#${debtId}`;
    const sk = `DEBT#${createdAt}#${debtId}`;

    // Update main debt to delivered + write feed entry atomically
    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `DEBT#${debtId}` } },
      UpdateExpression: 'SET #status = :delivered, deliveredAt = :now, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':delivered': { S: 'delivered' },
        ':now': { S: now },
        ':gsi2pk': { S: `GROUP#${groupId}#STATUS#delivered` },
        ':gsi2sk': { S: gsi2sk },
      },
    }));

    // Update both GSI4 items to delivered + write feed entry
    await dynamo.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Update: {
            TableName: TABLE,
            Key: {
              PK: { S: `PLAYERDEBT#${challengerId}#GROUP#${groupId}` },
              SK: { S: sk },
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
              PK: { S: `PLAYERDEBT#${statementMakerId}#GROUP#${groupId}` },
              SK: { S: sk },
            },
            UpdateExpression: 'SET #s = :s',
            ExpressionAttributeNames: { '#s': 'status' },
            ExpressionAttributeValues: { ':s': { S: 'delivered' } },
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
              type: { S: 'slap_delivered' },
              refId: { S: debtId },
              actorId: { S: callerId! },
              // summary is the pre-detail fallback; the client prefers the
              // fields below. debtorId took the punishment, creditorId gave it.
              summary: { S: `A punishment was delivered` },
              statement: { S: updated.statement?.S ?? '' },
              debtorId: { S: debtorId! },
              creditorId: { S: creditorId! },
              punishment: { S: updated.debtPunishment?.S ?? '' },
              readInOnly: { BOOL: false },
              createdAt: { S: now },
            },
          },
        },
      ],
    }));

    // Settling is the group's entertainment, so it goes wide — minus the two
    // people who were there for it and just confirmed it happened.
    await publishNotification({
      type: 'manchester_settled',
      groupId,
      audience: { kind: 'group', excludePlayerIds: [debtorId!, creditorId!] },
      debtId,
      debtorId: debtorId!,
      creditorId: creditorId!,
      punishment: updated.debtPunishment?.S as 'slap' | 'infinity_grog' | undefined,
    });

    const final = await dynamo.send(new GetItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `DEBT#${debtId}` } },
    }));
    return marshalDebt(final.Item!);
  }

  // Only one side has confirmed. Same reasoning as the resolution half: a lone
  // confirmation is a state rather than an event, so nothing is written to the
  // feed and this push is what tells the other party it is on them.
  await publishNotification({
    type: 'confirmation_awaiting_you',
    groupId,
    audience: { kind: 'players', playerIds: [isDebtor ? creditorId! : debtorId!] },
    debtId,
    actorId: callerId,
    statement: updated.statement?.S,
  });

  return marshalDebt(updated);
};

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

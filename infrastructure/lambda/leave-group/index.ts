import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DeleteItemCommand,
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  TransactWriteItemsCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

interface Args {
  groupId: string;
}

interface AppSyncCognitoIdentity {
  sub: string;
  [key: string]: unknown;
}

function err(code: string): never {
  throw new Error(code);
}

/**
 * Removes the caller from a group.
 *
 * Leaving is a hard delete, not a soft one: the Member row goes, and so does
 * every debt the leaver is party to that has not been delivered. Delivered
 * debts stay — they are history, and both sides already confirmed them. The
 * feed is left alone too, so the leaver's past still reads in the thread; the
 * app no longer finds them in the member list and names them as a quitter.
 *
 * The creator cannot leave. Every grog mutation is admin-gated and the creator
 * is the one admin a group is guaranteed to have, so letting them walk out
 * could strand the grog for good. They can delete the group instead.
 */
export const handler: AppSyncResolverHandler<Args, boolean> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const callerId = identity?.sub;
  if (!callerId) err('UNAUTHORIZED');

  const { groupId } = event.arguments;

  const [groupResult, memberResult] = await Promise.all([
    dynamo.send(new GetItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
    })),
    dynamo.send(new GetItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `MEMBER#${callerId}` } },
    })),
  ]);

  const group = groupResult.Item;
  if (!group) err('GROUP_NOT_FOUND');
  if (!memberResult.Item) err('NOT_A_MEMBER');
  if (group.creatorId?.S === callerId) err('CREATOR_CANNOT_LEAVE');

  // The caller's own index rows list every debt they are party to in this group.
  const indexRows: Record<string, AttributeValue>[] = [];
  let lastKey: Record<string, AttributeValue> | undefined;
  do {
    const page = await dynamo.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: `PLAYERDEBT#${callerId}#GROUP#${groupId}` } },
      ExclusiveStartKey: lastKey,
    }));
    indexRows.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  // Same three-row delete as void-debt: the DEBT row and both parties' index rows.
  for (const row of indexRows) {
    if (row.status?.S === 'delivered') continue;
    const debtId = row.debtId?.S;
    const challengerId = row.challengerId?.S;
    const statementMakerId = row.statementMakerId?.S;
    const sk = row.SK?.S;
    if (!debtId || !challengerId || !statementMakerId || !sk) continue;

    await dynamo.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Delete: {
            TableName: TABLE,
            Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `DEBT#${debtId}` } },
          },
        },
        {
          Delete: {
            TableName: TABLE,
            Key: { PK: { S: `PLAYERDEBT#${challengerId}#GROUP#${groupId}` }, SK: { S: sk } },
          },
        },
        {
          Delete: {
            TableName: TABLE,
            Key: { PK: { S: `PLAYERDEBT#${statementMakerId}#GROUP#${groupId}` }, SK: { S: sk } },
          },
        },
      ],
    }));
  }

  // Admin checks read adminIds off METADATA, so a departed admin must come off
  // it — otherwise rejoining would hand the role straight back.
  if (group.adminIds?.SS?.includes(callerId!)) {
    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
      UpdateExpression: 'DELETE adminIds :me',
      ExpressionAttributeValues: { ':me': { SS: [callerId!] } },
    }));
  }

  // Last, so a failure above leaves the caller a member and a retry converges.
  await dynamo.send(new DeleteItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `MEMBER#${callerId}` } },
  }));

  return true;
};

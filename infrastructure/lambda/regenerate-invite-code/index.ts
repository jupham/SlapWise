import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  TransactWriteItemsCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

function generateInviteCode(): string {
  return randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
}

interface RegenerateArgs {
  groupId: string;
}

export const handler: AppSyncResolverHandler<RegenerateArgs, { groupId: string; inviteCode: string }> = async (event) => {
  const callerId = event.identity && 'sub' in event.identity ? event.identity.sub : null;
  if (!callerId) throw new Error('Unauthorized');

  const { groupId } = event.arguments;
  const now = new Date().toISOString();

  // Fetch current group to verify caller is creator/admin
  const groupResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
  }));

  const g = groupResult.Item;
  if (!g) throw new Error('Group not found');

  const isCreator = g.creatorId?.S === callerId;
  const isAdmin = g.adminIds?.SS?.includes(callerId) ?? false;
  if (!isCreator && !isAdmin) throw new Error('PERMISSION_DENIED');

  const newCode = generateInviteCode();
  const oldCode = g.inviteCode?.S;

  // Codes do not expire, so regenerating is the only way to revoke one: the
  // old code's lookup goes in the same transaction that publishes the new one.
  // It used to stay live until a 7-day TTL ran out, so "New Code" revoked
  // nothing. The condition on METADATA stops two concurrent regenerations from
  // each deleting the other's old code and leaving two live ones.
  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Update: {
          TableName: TABLE,
          Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
          UpdateExpression: 'SET inviteCode = :code',
          ConditionExpression: oldCode ? 'inviteCode = :old' : 'attribute_not_exists(inviteCode)',
          ExpressionAttributeValues: {
            ':code': { S: newCode },
            ...(oldCode ? { ':old': { S: oldCode } } : {}),
          },
        },
      },
      ...(oldCode
        ? [
            { Delete: { TableName: TABLE, Key: { PK: { S: `INVITE#${oldCode}` }, SK: { S: 'LOOKUP' } } } },
            { Delete: { TableName: TABLE, Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `INVITE#${oldCode}` } } } },
          ]
        : []),
      // Top-level lookup for join-by-code, and its twin under the group, as
      // create-group writes them. delete-group finds codes through the twins.
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `INVITE#${newCode}` },
            SK: { S: 'LOOKUP' },
            code: { S: newCode },
            groupId: { S: groupId },
            createdAt: { S: now },
            active: { BOOL: true },
          },
        },
      },
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `INVITE#${newCode}` },
            code: { S: newCode },
            groupId: { S: groupId },
            createdAt: { S: now },
            active: { BOOL: true },
          },
        },
      },
    ],
  }));

  return { groupId, inviteCode: newCode };
};

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
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

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

  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      // Update group metadata with new invite code
      {
        Update: {
          TableName: TABLE,
          Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
          UpdateExpression: 'SET inviteCode = :code',
          ExpressionAttributeValues: { ':code': { S: newCode } },
        },
      },
      // Write top-level lookup item for join-by-code
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
            TTL: { N: String(ttl) },
          },
        },
      },
    ],
  }));

  return { groupId, inviteCode: newCode };
};

import { APIGatewayProxyHandler } from 'aws-lambda';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' };
import {
  DynamoDBClient,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

function generateInviteCode(): string {
  return randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = event.requestContext.authorizer?.claims?.sub as string | undefined;
  const callerEmail = event.requestContext.authorizer?.claims?.email as string | undefined;
  // Display name chosen at signup. Denormalised onto the Member record; the
  // update-username Lambda fans a later change out across these copies.
  const callerName = event.requestContext.authorizer?.claims?.preferred_username as
    | string
    | undefined;
  if (!callerId) {
    return { headers: CORS_HEADERS, statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const body = JSON.parse(event.body ?? '{}') as { name?: string };
  if (!body.name?.trim()) {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'Group name is required' }) };
  }

  const groupId = randomUUID();
  const inviteCode = generateInviteCode();
  const now = new Date().toISOString();
  // Invite codes expire in 7 days
  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;

  const params: TransactWriteItemsCommandInput = {
    TransactItems: [
      // Group metadata
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: 'METADATA' },
            groupId: { S: groupId },
            name: { S: body.name.trim() },
            creatorId: { S: callerId },
            adminIds: { SS: [callerId] },
            inviteCode: { S: inviteCode },
            readInGameName: { NULL: true },
            createdAt: { S: now },
            GSI1PK: { S: `GROUP#${groupId}` },
            GSI1SK: { S: `METADATA` },
          },
        },
      },
      // Creator as first member — includes group metadata fields for GSI1 query
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `MEMBER#${callerId}` },
            playerId: { S: callerId },
            groupId: { S: groupId },
            username: { S: callerName ?? callerEmail?.split('@')[0] ?? callerId },
            name: { S: body.name.trim() },
            creatorId: { S: callerId },
            adminIds: { SS: [callerId] },
            inviteCode: { S: inviteCode },
            readInGameName: { NULL: true },
            createdAt: { S: now },
            joinedAt: { S: now },
            isReadIn: { BOOL: false },
            readInConfirmedAt: { NULL: true },
            GSI1PK: { S: `PLAYER#${callerId}` },
            GSI1SK: { S: `GROUP#${groupId}` },
          },
        },
      },
      // Active invite code (under group for batch delete)
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `INVITE#${inviteCode}` },
            code: { S: inviteCode },
            groupId: { S: groupId },
            createdAt: { S: now },
            active: { BOOL: true },
            TTL: { N: String(ttl) },
          },
        },
      },
      // Top-level invite code lookup (for join-by-code-only)
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `INVITE#${inviteCode}` },
            SK: { S: 'LOOKUP' },
            code: { S: inviteCode },
            groupId: { S: groupId },
            createdAt: { S: now },
            active: { BOOL: true },
            TTL: { N: String(ttl) },
          },
        },
      },
    ],
  };

  await dynamo.send(new TransactWriteItemsCommand(params));

  return {
    headers: CORS_HEADERS,
    statusCode: 201,
    body: JSON.stringify({
      groupId,
      name: body.name.trim(),
      creatorId: callerId,
      adminIds: [callerId],
      inviteCode,
      createdAt: now,
    }),
  };
};

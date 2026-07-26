import { APIGatewayProxyHandler } from 'aws-lambda';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' };
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
  TransactWriteItemsCommandInput,
} from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

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

  const body = JSON.parse(event.body ?? '{}') as { inviteCode?: string };
  if (!body.inviteCode?.trim()) {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'inviteCode is required' }) };
  }

  const code = body.inviteCode.trim().toUpperCase();
  const now = new Date().toISOString();
  const nowEpoch = Math.floor(Date.now() / 1000);

  // Look up groupId from the top-level invite code item
  const lookupResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `INVITE#${code}` }, SK: { S: 'LOOKUP' } },
  }));

  const lookup = lookupResult.Item;
  if (
    !lookup ||
    lookup.active?.BOOL !== true ||
    (lookup.TTL?.N !== undefined && Number(lookup.TTL.N) < nowEpoch)
  ) {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ code: 'INVALID_INVITE_CODE', message: 'Invite code is invalid or expired' }) };
  }

  const groupId = lookup.groupId?.S;
  if (!groupId) {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ code: 'INVALID_INVITE_CODE', message: 'Invite code is invalid or expired' }) };
  }

  // Fetch group metadata
  const groupResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
  }));

  const g = groupResult.Item;
  if (!g) {
    return { headers: CORS_HEADERS, statusCode: 404, body: JSON.stringify({ message: 'Group not found' }) };
  }

  const params: TransactWriteItemsCommandInput = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `MEMBER#${callerId}` },
            playerId: { S: callerId },
            groupId: { S: groupId },
            username: { S: callerName ?? callerEmail?.split('@')[0] ?? callerId },
            name: { S: g.name?.S ?? '' },
            creatorId: { S: g.creatorId?.S ?? '' },
            adminIds: g.adminIds ?? { SS: [] },
            inviteCode: { S: g.inviteCode?.S ?? '' },
            readInGameName: g.readInGameName ?? { NULL: true },
            createdAt: { S: g.createdAt?.S ?? now },
            joinedAt: { S: now },
            isReadIn: { BOOL: false },
            readInConfirmedAt: { NULL: true },
            GSI1PK: { S: `PLAYER#${callerId}` },
            GSI1SK: { S: `GROUP#${groupId}` },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ],
  };

  try {
    await dynamo.send(new TransactWriteItemsCommand(params));
  } catch (err: unknown) {
    const error = err as { name?: string };
    if (error.name === 'TransactionCanceledException') {
      return { headers: CORS_HEADERS, statusCode: 409, body: JSON.stringify({ message: 'Already a member of this group' }) };
    }
    throw err;
  }

  return {
    headers: CORS_HEADERS,
    statusCode: 200,
    body: JSON.stringify({
      groupId,
      name: g.name?.S,
      inviteCode: g.inviteCode?.S,
      createdAt: g.createdAt?.S,
      joinedAt: now,
    }),
  };
};

import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' };

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = event.requestContext?.authorizer?.claims?.sub as string | undefined;
  if (!callerId) {
    return { headers: CORS_HEADERS, statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const groupId = event.pathParameters?.groupId;
  if (!groupId) {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'Missing groupId' }) };
  }

  // Members only. This returns the invite code, so a non-member holding the
  // group id — someone who left, say — could otherwise read it and walk back
  // in. Consistent, because enterGroups calls this straight after a create or
  // join, when the Member row has only just been written.
  const member = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `MEMBER#${callerId}` } },
    ConsistentRead: true,
  }));
  if (!member.Item) {
    return { headers: CORS_HEADERS, statusCode: 403, body: JSON.stringify({ message: 'Not a member of this group' }) };
  }

  const result = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: 'METADATA' },
    },
  }));

  if (!result.Item) {
    return { headers: CORS_HEADERS, statusCode: 404, body: JSON.stringify({ message: 'Group not found' }) };
  }

  const item = result.Item;
  return {
    headers: CORS_HEADERS,
    statusCode: 200,
    body: JSON.stringify({
      groupId: item.groupId?.S,
      name: item.name?.S,
      creatorId: item.creatorId?.S,
      adminIds: item.adminIds?.SS ?? [],
      inviteCode: item.inviteCode?.S,
      readInGameName: item.readInGameName?.S ?? null,
      createdAt: item.createdAt?.S,
    }),
  };
};

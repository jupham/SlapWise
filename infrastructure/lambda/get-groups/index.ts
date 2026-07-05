import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' };

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = event.requestContext?.authorizer?.claims?.sub as string | undefined;
  if (!callerId) {
    return { headers: CORS_HEADERS, statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const result = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': { S: `PLAYER#${callerId}` },
      ':sk': { S: 'GROUP#' },
    },
  }));

  const groups = (result.Items ?? []).map(item => ({
    groupId: item.groupId?.S,
    name: item.name?.S,
    inviteCode: item.inviteCode?.S,
    creatorId: item.creatorId?.S,
    createdAt: item.createdAt?.S,
  }));

  return {
    headers: CORS_HEADERS,
    statusCode: 200,
    body: JSON.stringify(groups),
  };
};

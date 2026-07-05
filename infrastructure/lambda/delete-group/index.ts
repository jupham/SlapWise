import { APIGatewayProxyHandler } from 'aws-lambda';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' };
import {
  DynamoDBClient,
  GetItemCommand,
  QueryCommand,
  BatchWriteItemCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

// Helper to extract Cognito sub from the API Gateway authorizer context
function getCallerId(event: Parameters<APIGatewayProxyHandler>[0]): string | null {
  return (event.requestContext?.authorizer?.claims?.sub as string) ?? null;
}

export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = getCallerId(event);
  if (!callerId) {
    return { headers: CORS_HEADERS, statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  const groupId = event.pathParameters?.groupId;
  if (!groupId) {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'Missing groupId' }) };
  }

  // 1. Fetch group metadata
  const groupResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: 'METADATA' } },
  }));

  if (!groupResult.Item) {
    return { headers: CORS_HEADERS, statusCode: 404, body: JSON.stringify({ message: 'Group not found' }) };
  }

  const creatorId = groupResult.Item.creatorId?.S;
  if (creatorId !== callerId) {
    return { headers: CORS_HEADERS, statusCode: 403, body: JSON.stringify({ message: 'Only the group creator can delete this group' }) };
  }

  // 2. Query all items with PK = GROUP#<groupId> and delete them in batches
  let lastKey: Record<string, AttributeValue> | undefined = undefined;
  const deleteRequests: { DeleteRequest: { Key: Record<string, { S: string }> } }[] = [];

  do {
    const result = await dynamo.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: `GROUP#${groupId}` } },
      ExclusiveStartKey: lastKey,
    }));

    for (const item of result.Items ?? []) {
      if (item.PK?.S && item.SK?.S) {
        deleteRequests.push({
          DeleteRequest: { Key: { PK: { S: item.PK.S }, SK: { S: item.SK.S } } },
        });
      }
    }

    lastKey = result.LastEvaluatedKey as Record<string, AttributeValue> | undefined;
  } while (lastKey);

  // BatchWriteItem supports max 25 items per call
  for (let i = 0; i < deleteRequests.length; i += 25) {
    const batch = deleteRequests.slice(i, i + 25);
    await dynamo.send(new BatchWriteItemCommand({
      RequestItems: { [TABLE]: batch },
    }));
  }

  return { headers: CORS_HEADERS, statusCode: 200, body: JSON.stringify({ message: 'Group deleted' }) };
};

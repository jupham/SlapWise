import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

const MIN_LEN = 2;
const MAX_LEN = 24;

/**
 * Fans a display-name change out across the denormalised copies.
 *
 * The name lives in two places: the Cognito preferred_username attribute (what
 * create-group and join-group read when writing a new Member record) and the
 * username field copied onto the Player PROFILE and every existing Member
 * record (what the group screens read).
 *
 * The client updates Cognito itself via Amplify's updateUserAttributes — a
 * user-scoped call needing no admin privileges — then calls this endpoint for
 * the DynamoDB half. Keeping Cognito out of this Lambda avoids a circular stack
 * dependency: CognitoStack already depends on LambdaStack for its triggers, so
 * a Lambda here cannot reference the user pool id.
 *
 * Member records carry GSI1PK = PLAYER#<playerId>, which makes "every group
 * this player is in" a single index query; the PROFILE record shares that
 * partition, so one query covers both kinds of copy.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = event.requestContext.authorizer?.claims?.sub as string | undefined;

  if (!callerId) {
    return { headers: CORS_HEADERS, statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  let username: unknown;
  try {
    username = JSON.parse(event.body ?? '{}').username;
  } catch {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body' }) };
  }

  if (typeof username !== 'string') {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'username is required' }) };
  }

  const trimmed = username.trim();
  if (trimmed.length < MIN_LEN || trimmed.length > MAX_LEN) {
    return {
      headers: CORS_HEADERS,
      statusCode: 400,
      body: JSON.stringify({ message: `Display name must be between ${MIN_LEN} and ${MAX_LEN} characters` }),
    };
  }

  const owned = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: `PLAYER#${callerId}` } },
    })
  );

  const items = owned.Items ?? [];
  await Promise.all(
    items.map((item) => {
      const pk = item.PK?.S;
      const sk = item.SK?.S;
      if (!pk || !sk) return Promise.resolve();
      return dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { PK: { S: pk }, SK: { S: sk } },
          UpdateExpression: 'SET username = :u',
          ExpressionAttributeValues: { ':u': { S: trimmed } },
        })
      );
    })
  );

  return {
    headers: CORS_HEADERS,
    statusCode: 200,
    body: JSON.stringify({ username: trimmed, updated: items.length }),
  };
};

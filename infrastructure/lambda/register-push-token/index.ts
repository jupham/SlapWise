import { APIGatewayProxyHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

/**
 * Expo hands out tokens of exactly this shape. Validating it here keeps junk
 * out of the table: an unrecognised string would otherwise sit there until a
 * dispatch attempt failed on it, once per notification, forever.
 */
const EXPO_TOKEN = /^ExponentPushToken\[[^\]]+\]$/;

/**
 * Devices that stop checking in get reaped rather than accumulating. Six months
 * is long enough that a phone left in a drawer over a summer still works, and
 * short enough that a reinstalled device's old token does not outlive the app.
 * Re-registering pushes the deadline out, and the app registers on every
 * launch, so an in-use device never expires.
 */
const TTL_DAYS = 180;

/**
 * Stores one Expo push token per device for the calling player.
 *
 * Keyed PK=PLAYER#<id>, SK=PUSHTOKEN#<token> so a player on a phone and a
 * tablet gets both, and so the dispatcher can read every token for a player
 * with a single begins_with query.
 *
 * These records deliberately carry **no GSI1 keys**, unlike the profile and
 * Member records that share their partition. GSI1PK = PLAYER#<id> is the
 * "everything owned by this player" query, and both update-username and
 * delete-account walk it blindly writing a `username` onto every row they find.
 * A token is not a thing with a display name, and staying out of that index is
 * cheaper than teaching both of them to skip it. delete-account removes tokens
 * explicitly instead.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = event.requestContext.authorizer?.claims?.sub as string | undefined;

  if (!callerId) {
    return { headers: CORS_HEADERS, statusCode: 401, body: JSON.stringify({ message: 'Unauthorized' }) };
  }

  let token: unknown;
  try {
    token = JSON.parse(event.body ?? '{}').token;
  } catch {
    return { headers: CORS_HEADERS, statusCode: 400, body: JSON.stringify({ message: 'Invalid JSON body' }) };
  }

  if (typeof token !== 'string' || !EXPO_TOKEN.test(token)) {
    return {
      headers: CORS_HEADERS,
      statusCode: 400,
      body: JSON.stringify({ message: 'A valid Expo push token is required' }),
    };
  }

  const key = { PK: { S: `PLAYER#${callerId}` }, SK: { S: `PUSHTOKEN#${token}` } };

  // DELETE is how the app drops its token on logout — the device stays signed
  // out, so it must stop hearing about the group.
  if (event.httpMethod === 'DELETE') {
    await dynamo.send(new DeleteItemCommand({ TableName: TABLE, Key: key }));
    return { headers: CORS_HEADERS, statusCode: 200, body: JSON.stringify({ removed: true }) };
  }

  const now = new Date();
  const ttl = Math.floor(now.getTime() / 1000) + TTL_DAYS * 24 * 60 * 60;

  await dynamo.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: {
        ...key,
        playerId: { S: callerId },
        pushToken: { S: token },
        updatedAt: { S: now.toISOString() },
        TTL: { N: String(ttl) },
      },
    })
  );

  return { headers: CORS_HEADERS, statusCode: 200, body: JSON.stringify({ registered: true }) };
};

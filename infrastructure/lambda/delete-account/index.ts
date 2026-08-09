import { APIGatewayProxyHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  DeleteItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { CORS_HEADERS } from '../shared/cors';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

/**
 * The name every remaining record shows in place of the deleted player. Group
 * screens resolve ids against the member list at render time, so the Member
 * records have to survive — deleting them would leave every historical feed
 * entry unable to name anyone, including for the other party.
 */
const TOMBSTONE = 'Deleted player';

/**
 * Deletes the caller's account, as required by App Store guideline 5.1.1(v):
 * an app that supports account creation must let people delete it from inside
 * the app, and disabling is explicitly not enough.
 *
 * Anonymise rather than erase. A Manchester is a record of something that
 * happened between two people, so hard-deleting one party's rows would silently
 * rewrite the other party's ledger and feed. Instead:
 *
 *   - the Player PROFILE record is deleted outright — it holds the email, which
 *     is the personal data the guideline is actually about;
 *   - every Member record keeps its id but loses the denormalised name, so the
 *     history still reads as a sequence of events and simply names a player who
 *     is no longer here.
 *
 * Nothing blocks on outstanding debts. The guideline asks that deletion be easy
 * to find and not obstructed, and gating it behind settling up would read as
 * exactly that. A debt with a deleted debtor keeps working: it references ids,
 * and the tombstone resolves.
 *
 * Cognito is deliberately not touched here, for the same reason as
 * update-username — CognitoStack already depends on LambdaStack for its
 * triggers, so a Lambda in that stack cannot reference the user pool id without
 * a circular dependency. The client calls Amplify's user-scoped deleteUser()
 * for that half, *after* this endpoint returns: the DynamoDB cleanup is the
 * part that needs a valid caller identity, so it has to go first.
 */
export const handler: APIGatewayProxyHandler = async (event) => {
  const callerId = event.requestContext.authorizer?.claims?.sub as string | undefined;

  if (!callerId) {
    return {
      headers: CORS_HEADERS,
      statusCode: 401,
      body: JSON.stringify({ message: 'Unauthorized' }),
    };
  }

  // Member records carry GSI1PK = PLAYER#<playerId> and the PROFILE record
  // shares that partition, so one query reaches everything owned by a player.
  const owned = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': { S: `PLAYER#${callerId}` } },
    })
  );

  const items = owned.Items ?? [];
  let anonymised = 0;
  let profileDeleted = false;

  await Promise.all(
    items.map((item) => {
      const pk = item.PK?.S;
      const sk = item.SK?.S;
      if (!pk || !sk) return Promise.resolve();

      if (sk === 'PROFILE') {
        profileDeleted = true;
        return dynamo.send(
          new DeleteItemCommand({
            TableName: TABLE,
            Key: { PK: { S: pk }, SK: { S: sk } },
          })
        );
      }

      anonymised += 1;
      return dynamo.send(
        new UpdateItemCommand({
          TableName: TABLE,
          Key: { PK: { S: pk }, SK: { S: sk } },
          UpdateExpression: 'SET username = :u, deletedAt = :t',
          ExpressionAttributeValues: {
            ':u': { S: TOMBSTONE },
            ':t': { S: new Date().toISOString() },
          },
        })
      );
    })
  );

  return {
    headers: CORS_HEADERS,
    statusCode: 200,
    body: JSON.stringify({ profileDeleted, anonymised }),
  };
};

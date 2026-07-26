import { PostConfirmationTriggerEvent, PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: PostConfirmationTriggerHandler = async (event: PostConfirmationTriggerEvent) => {
  const playerId = event.request.userAttributes.sub;
  const email = event.request.userAttributes.email;
  const createdAt = new Date().toISOString();

  // Registration requires a display name, so preferred_username is normally
  // present. The fallback only fires if a client signs up without it — use the
  // local part rather than the address so a full email never reaches the UI.
  const username = event.request.userAttributes.preferred_username || email.split('@')[0];

  await client.send(
    new PutItemCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: { S: `PLAYER#${playerId}` },
        SK: { S: 'PROFILE' },
        playerId: { S: playerId },
        username: { S: username },
        email: { S: email },
        createdAt: { S: createdAt },
        pushEnabled: { BOOL: true },
        pinpointEndpointId: { NULL: true },
        GSI1PK: { S: `PLAYER#${playerId}` },
        GSI1SK: { S: 'PROFILE' },
      },
    })
  );

  return event;
};

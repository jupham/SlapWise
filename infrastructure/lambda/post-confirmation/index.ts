import { PostConfirmationTriggerEvent, PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient, TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: PostConfirmationTriggerHandler = async (event: PostConfirmationTriggerEvent) => {
  const playerId = event.userName;
  const username =
    event.request.userAttributes['custom:username'] ?? event.userName;
  const email = event.request.userAttributes.email;
  const createdAt = new Date().toISOString();

  await client.send(
    new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
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
          },
        },
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK: { S: `USERNAME#${username}` },
              SK: { S: 'LOOKUP' },
              playerId: { S: playerId },
            },
          },
        },
      ],
    })
  );

  return event;
};

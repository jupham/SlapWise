import { PreSignUpTriggerEvent, PreSignUpTriggerHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;

export const handler: PreSignUpTriggerHandler = async (event: PreSignUpTriggerEvent) => {
  const username =
    event.request.userAttributes['custom:username'] ?? event.userName;

  const result = await client.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: {
        PK: { S: `USERNAME#${username}` },
        SK: { S: 'LOOKUP' },
      },
    })
  );

  if (result.Item) {
    throw new Error('USERNAME_TAKEN');
  }

  return event;
};

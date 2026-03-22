import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { randomUUID } from 'crypto';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

interface Args {
  groupId: string;
  callerId: string;
  chuggedPlayerIds: string[];
}

interface AppSyncCognitoIdentity {
  sub: string;
  [key: string]: unknown;
}

function err(code: string): never {
  throw new Error(code);
}

export const handler: AppSyncResolverHandler<Args, unknown> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const callerSub = identity?.sub;
  if (!callerSub) err('UNAUTHORIZED');

  const { groupId, callerId, chuggedPlayerIds } = event.arguments;

  // Validate caller is a group member
  const memberResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `MEMBER#${callerSub}` },
    },
  }));
  if (!memberResult.Item) err('UNAUTHORIZED');

  if (!chuggedPlayerIds || chuggedPlayerIds.length === 0) err('VALIDATION_ERROR');

  const eventId = randomUUID();
  const entryId = randomUUID();
  const now = new Date().toISOString();

  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      // CHUG event item
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `CHUG#${now}#${eventId}` },
            eventId: { S: eventId },
            groupId: { S: groupId },
            callerId: { S: callerId },
            chuggedPlayerIds: { L: chuggedPlayerIds.map((id) => ({ S: id })) },
            createdAt: { S: now },
          },
        },
      },
      // Feed entry — readInOnly: false (chug events are visible to all)
      {
        Put: {
          TableName: TABLE,
          Item: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `FEED#${now}#${entryId}` },
            entryId: { S: entryId },
            groupId: { S: groupId },
            type: { S: 'chug_event' },
            refId: { S: eventId },
            actorId: { S: callerSub! },
            summary: { S: `Game was called` },
            readInOnly: { BOOL: false },
            createdAt: { S: now },
          },
        },
      },
    ],
  }));

  return {
    __typename: 'ChugEvent',
    eventId,
    groupId,
    callerId,
    chuggedPlayerIds,
    createdAt: now,
  };
};

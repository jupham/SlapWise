import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  UpdateItemCommand,
  QueryCommand,
  AttributeValue,
} from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const dynamo = new DynamoDBClient({});
const sns = new SNSClient({});
const TABLE = process.env.TABLE_NAME!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

interface Args {
  groupId: string;
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
  const callerId = identity?.sub;
  if (!callerId) err('UNAUTHORIZED');

  const { groupId } = event.arguments;
  const now = new Date().toISOString();

  // 1. Set isReadIn=true with condition preventing unsetting
  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE,
      Key: {
        PK: { S: `GROUP#${groupId}` },
        SK: { S: `MEMBER#${callerId}` },
      },
      UpdateExpression: 'SET isReadIn = :true, readInConfirmedAt = :now',
      ConditionExpression: 'attribute_exists(PK) AND (attribute_not_exists(isReadIn) OR isReadIn = :false)',
      ExpressionAttributeValues: {
        ':true': { BOOL: true },
        ':false': { BOOL: false },
        ':now': { S: now },
      },
    }));
  } catch (e) {
    console.error('[confirm-read-in] UpdateItem failed:', e);
    const errName = (e as { name?: string }).name;
    if (errName === 'ConditionalCheckFailedException') {
      err('ALREADY_READ_IN');
    }
    throw e;
  }

  // 2. Fetch updated member item to return
  const memberResult = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': { S: `GROUP#${groupId}` },
      ':sk': { S: `MEMBER#${callerId}` },
    },
  }));

  const memberItem = memberResult.Items?.[0];
  if (!memberItem) err('MEMBER_NOT_FOUND');

  // 3. Best-effort: notify existing read-in players via SNS
  if (SNS_TOPIC_ARN) {
    try {
      // Query all read-in members in the group
      const readInResult = await dynamo.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'isReadIn = :readIn AND SK <> :self',
        ExpressionAttributeValues: {
          ':pk': { S: `GROUP#${groupId}` },
          ':sk': { S: 'MEMBER#' },
          ':readIn': { BOOL: true },
          ':self': { S: `MEMBER#${callerId}` },
        },
      }));

      const readInPlayerIds = (readInResult.Items ?? [])
        .map((item) => item.playerId?.S)
        .filter((id): id is string => id !== undefined);

      if (readInPlayerIds.length > 0) {
        await sns.send(new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          Message: JSON.stringify({
            type: 'player_read_in',
            groupId,
            newReadInPlayerId: callerId,
            recipientPlayerIds: readInPlayerIds,
          }),
        }));
      }
    } catch (snsErr) {
      console.error('[confirm-read-in] failed to send read-in notification:', snsErr);
    }
  }

  return marshalMember(memberItem!);
};

function marshalMember(item: Record<string, AttributeValue>) {
  return {
    __typename: 'Member',
    playerId: item.playerId?.S ?? null,
    groupId: item.groupId?.S ?? null,
    username: item.username?.S ?? null,
    joinedAt: item.joinedAt?.S ?? null,
    isReadIn: item.isReadIn?.BOOL ?? false,
    readInConfirmedAt: item.readInConfirmedAt?.S ?? null,
  };
}

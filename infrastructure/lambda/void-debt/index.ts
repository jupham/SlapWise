import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

interface Args {
  debtId: string;
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

  const { debtId, groupId } = event.arguments;

  // Fetch debt
  const debtResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: `DEBT#${debtId}` },
    },
  }));

  const debt = debtResult.Item;
  if (!debt) err('DEBT_NOT_FOUND');

  const challengerId = debt.challengerId?.S!;
  const statementMakerId = debt.statementMakerId?.S!;
  const createdAt = debt.createdAt?.S!;
  const status = debt.status?.S ?? '';

  // Delivered debts cannot be voided
  if (status === 'delivered') err('DEBT_ALREADY_DELIVERED');

  // Check if caller is an admin
  const groupResult = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: {
      PK: { S: `GROUP#${groupId}` },
      SK: { S: 'METADATA' },
    },
  }));

  const group = groupResult.Item;
  if (!group) err('GROUP_NOT_FOUND');

  const creatorId = group.creatorId?.S ?? '';
  const adminIds = group.adminIds?.SS ?? [];
  const isAdmin = callerId === creatorId || adminIds.includes(callerId!);

  // Check if this is a mutual void (both parties chose void during resolution)
  const challengerConfirmation = debt.challengerConfirmation?.M;
  const statementMakerConfirmation = debt.statementMakerConfirmation?.M;
  const isMutualVoid =
    challengerConfirmation?.outcome?.S === 'void' &&
    statementMakerConfirmation?.outcome?.S === 'void';

  if (!isAdmin && !isMutualVoid) err('UNAUTHORIZED');

  const sk = `DEBT#${createdAt}#${debtId}`;

  // Hard-delete: DEBT item + both PLAYERDEBT index items
  await dynamo.send(new TransactWriteItemsCommand({
    TransactItems: [
      {
        Delete: {
          TableName: TABLE,
          Key: {
            PK: { S: `GROUP#${groupId}` },
            SK: { S: `DEBT#${debtId}` },
          },
        },
      },
      {
        Delete: {
          TableName: TABLE,
          Key: {
            PK: { S: `PLAYERDEBT#${challengerId}#GROUP#${groupId}` },
            SK: { S: sk },
          },
        },
      },
      {
        Delete: {
          TableName: TABLE,
          Key: {
            PK: { S: `PLAYERDEBT#${statementMakerId}#GROUP#${groupId}` },
            SK: { S: sk },
          },
        },
      },
    ],
  }));

  return true;
};

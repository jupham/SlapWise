import { AppSyncResolverHandler } from 'aws-lambda';
import {
  DynamoDBClient,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

interface Args {
  groupId: string;
}

interface NetSummary {
  playerId: string;
  username: string;
  netSlaps: number;
}

interface AppSyncCognitoIdentity {
  sub: string;
  username?: string;
  [key: string]: unknown;
}

function err(code: string): never {
  throw new Error(code);
}

export const handler: AppSyncResolverHandler<Args, NetSummary[]> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  if (!identity?.sub) err('UNAUTHORIZED');

  const { groupId } = event.arguments;

  // 1. Query all resolved debts via GSI2
  const resolvedResult = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'GSI2',
    KeyConditionExpression: 'GSI2PK = :gsi2pk',
    ExpressionAttributeValues: {
      ':gsi2pk': { S: `GROUP#${groupId}#STATUS#resolved` },
    },
  }));

  const resolvedDebts = resolvedResult.Items ?? [];

  // 2. Tally net slaps per player
  // netSlaps[playerId] = (count as creditor) - (count as debtor)
  // positive = net owed to you, negative = net you owe
  const netSlapsMap = new Map<string, number>();

  for (const debt of resolvedDebts) {
    const debtorId = debt.debtorId?.S ?? null;
    const creditorId = debt.creditorId?.S ?? null;

    if (debtorId) {
      netSlapsMap.set(debtorId, (netSlapsMap.get(debtorId) ?? 0) - 1);
    }
    if (creditorId) {
      netSlapsMap.set(creditorId, (netSlapsMap.get(creditorId) ?? 0) + 1);
    }
  }

  if (netSlapsMap.size === 0) {
    return [];
  }

  // 3. Query group members to get usernames
  const membersResult = await dynamo.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': { S: `GROUP#${groupId}` },
      ':skPrefix': { S: 'MEMBER#' },
    },
  }));

  const usernameMap = new Map<string, string>();
  for (const member of membersResult.Items ?? []) {
    const playerId = member.playerId?.S;
    const username = member.username?.S;
    if (playerId && username) {
      usernameMap.set(playerId, username);
    }
  }

  // 4. Build result array for all players in the net slaps map
  const result: NetSummary[] = [];
  for (const [playerId, netSlaps] of netSlapsMap.entries()) {
    result.push({
      playerId,
      username: usernameMap.get(playerId) ?? playerId,
      netSlaps,
    });
  }

  return result;
};

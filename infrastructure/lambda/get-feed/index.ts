import { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

type Item = Record<string, AttributeValue>;

interface AppSyncCognitoIdentity {
  sub: string;
  [key: string]: unknown;
}

function err(code: string): never {
  throw new Error(code);
}

const s = (v: AttributeValue | undefined): string | null => v?.S ?? null;
const ids = (v: AttributeValue | undefined): string[] | null => (v?.L ? v.L.map((x) => x.S!).filter(Boolean) : null);

/**
 * The group feed, newest first, with read-in entries redacted for anyone who
 * is not read in.
 *
 * This used to be a bare DynamoDB query resolver, which returned every row in
 * full to any signed-in user who knew the group id — including the read-in
 * game's entries, whose whole point is that outsiders cannot see them. Hiding
 * them in the app would only hide them from the app; the gate has to sit where
 * the data leaves the server.
 *
 * A redacted row keeps its type, time and refId — so it still threads, and
 * outsiders can see that *something* happened — and loses everything that
 * says who or what.
 */
export const handler: AppSyncResolverHandler<{ groupId: string }, unknown[]> = async (event) => {
  const identity = event.identity as AppSyncCognitoIdentity | null;
  const playerId = identity?.sub;
  if (!playerId) err('UNAUTHORIZED');

  const { groupId } = event.arguments;

  const member = await dynamo.send(new GetItemCommand({
    TableName: TABLE,
    Key: { PK: { S: `GROUP#${groupId}` }, SK: { S: `MEMBER#${playerId}` } },
  }));
  if (!member.Item) err('UNAUTHORIZED');
  const readIn = member.Item.isReadIn?.BOOL === true;

  const items: Item[] = [];
  let lastKey: Item | undefined;
  do {
    const page = await dynamo.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': { S: `GROUP#${groupId}` }, ':sk': { S: 'FEED#' } },
      ScanIndexForward: false,
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(page.Items ?? []));
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);

  return items.map((item) => {
    const readInOnly = item.readInOnly?.BOOL === true;
    const base = {
      entryId: s(item.entryId),
      groupId: s(item.groupId),
      type: s(item.type),
      readInOnly,
      refId: s(item.refId),
      createdAt: s(item.createdAt),
    };

    if (readInOnly && !readIn) {
      return {
        ...base,
        // actorId is non-null in the schema; empty says "someone" without saying who.
        actorId: '',
        summary: 'Something happened that you are not read in on.',
        redacted: true,
      };
    }

    return {
      ...base,
      actorId: s(item.actorId) ?? '',
      summary: s(item.summary) ?? '',
      redacted: false,
      statement: s(item.statement),
      challengerId: s(item.challengerId),
      statementMakerId: s(item.statementMakerId),
      debtorId: s(item.debtorId),
      creditorId: s(item.creditorId),
      outcome: s(item.outcome),
      punishment: s(item.punishment),
      amountMl: item.amountMl?.N !== undefined ? Number(item.amountMl.N) : null,
      calledPlayerIds: ids(item.calledPlayerIds),
      chuggerIds: ids(item.chuggerIds),
    };
  });
};

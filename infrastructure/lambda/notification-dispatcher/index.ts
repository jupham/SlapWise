import { SNSHandler } from 'aws-lambda';
import { DynamoDBClient, QueryCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import type { NotificationEvent } from '../shared/notifications';

const dynamo = new DynamoDBClient({});
const TABLE = process.env.TABLE_NAME!;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo rejects anything larger in a single request. */
const CHUNK = 100;

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  channelId: string;
  data: Record<string, string | undefined>;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/**
 * Turns the events raised by the mutations into Expo push notifications.
 *
 * Expo's push service rather than SNS mobile push or Pinpoint: EAS already owns
 * the FCM and APNs credentials for this project, so there is nothing to
 * configure per platform and no per-device SNS platform endpoint to keep in
 * step with a token that rotates. Pinpoint was the original plan — an app and
 * IAM for it were deployed and never used — and AWS has since put it on a
 * deprecation path, so it was removed rather than finished.
 *
 * Names are resolved here, not by the device. Feed entries store ids precisely
 * so a rename cannot make history lie, but a notification is rendered once and
 * read once, so there is no later moment for it to go stale — and the device
 * has no member list to resolve against at the instant a push lands.
 */
export const handler: SNSHandler = async (event) => {
  for (const record of event.Records) {
    let payload: NotificationEvent;
    try {
      payload = JSON.parse(record.Sns.Message) as NotificationEvent;
    } catch (err) {
      console.error('[dispatcher] unparseable SNS message:', record.Sns.Message, err);
      continue;
    }

    try {
      await dispatch(payload);
    } catch (err) {
      // One bad event must not poison the rest of the batch, and a failed push
      // is never worth a retry storm — the in-app feed is the source of truth
      // and the user will see it there regardless.
      console.error(`[dispatcher] failed to dispatch ${payload?.type}:`, err);
    }
  }
};

async function dispatch(event: NotificationEvent): Promise<void> {
  const members = await groupMembers(event.groupId);
  const nameOf = (id: string | undefined): string =>
    (id ? members.get(id) : undefined) ?? 'Someone';

  const rendered = render(event, nameOf);
  // Events with no push text are the ones deliberately left out of the
  // notification set — chug_event and player_read_in still publish, and land
  // here, and stop.
  if (!rendered) return;

  const recipientIds = resolveAudience(event, members);
  if (recipientIds.length === 0) return;

  const tokens = await tokensFor(recipientIds);
  if (tokens.length === 0) return;

  const messages: ExpoMessage[] = tokens.map(({ token }) => ({
    to: token,
    title: rendered.title,
    body: rendered.body,
    sound: 'default',
    // Matches the channel the app creates on launch. Without it Android files
    // the notification under a default channel with no heads-up display.
    channelId: 'default',
    data: { type: event.type, groupId: event.groupId, debtId: event.debtId, callId: event.callId },
  }));

  await send(messages, tokens);
}

/**
 * Who actually receives it. `players` is taken at face value; `group` expands
 * to the member list minus anyone the publisher excluded, which in practice is
 * whoever caused the event — being told what you just did is the fastest route
 * to a muted app.
 */
function resolveAudience(event: NotificationEvent, members: Map<string, string>): string[] {
  if (event.audience.kind === 'players') {
    return [...new Set(event.audience.playerIds)].filter(Boolean);
  }

  const excluded = new Set(event.audience.excludePlayerIds ?? []);
  return [...members.keys()].filter((id) => !excluded.has(id));
}

/** playerId → display name, for every member of the group. */
async function groupMembers(groupId: string): Promise<Map<string, string>> {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': { S: `GROUP#${groupId}` },
        ':sk': { S: 'MEMBER#' },
      },
    })
  );

  const members = new Map<string, string>();
  for (const item of result.Items ?? []) {
    const playerId = item.playerId?.S;
    if (playerId) members.set(playerId, item.username?.S ?? 'Someone');
  }
  return members;
}

/**
 * Every device belonging to every recipient. A player with no registered device
 * simply contributes nothing — declining the permission prompt is a valid state,
 * not an error.
 */
async function tokensFor(playerIds: string[]): Promise<{ playerId: string; token: string }[]> {
  const perPlayer = await Promise.all(
    playerIds.map(async (playerId) => {
      const result = await dynamo.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': { S: `PLAYER#${playerId}` },
            ':sk': { S: 'PUSHTOKEN#' },
          },
        })
      );
      return (result.Items ?? [])
        .map((item) => item.pushToken?.S)
        .filter((token): token is string => Boolean(token))
        .map((token) => ({ playerId, token }));
    })
  );

  return perPlayer.flat();
}

async function send(
  messages: ExpoMessage[],
  tokens: { playerId: string; token: string }[]
): Promise<void> {
  for (let i = 0; i < messages.length; i += CHUNK) {
    const chunk = messages.slice(i, i + CHUNK);

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      console.error('[dispatcher] Expo push rejected the batch:', response.status, await response.text());
      continue;
    }

    const body = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = body.data ?? [];

    // Tickets come back positionally, one per message in the chunk.
    await Promise.all(
      tickets.map((ticket, index) => {
        if (ticket.status !== 'error') return Promise.resolve();

        const failed = tokens[i + index];
        if (ticket.details?.error === 'DeviceNotRegistered' && failed) {
          // The app was uninstalled or the token rotated. Expo will reject it
          // forever, so drop it rather than retrying it on every future event.
          return dynamo.send(
            new DeleteItemCommand({
              TableName: TABLE,
              Key: {
                PK: { S: `PLAYER#${failed.playerId}` },
                SK: { S: `PUSHTOKEN#${failed.token}` },
              },
            })
          );
        }

        console.error('[dispatcher] Expo rejected a message:', ticket.message, ticket.details);
        return Promise.resolve();
      })
    );
  }
}

/**
 * The notification text.
 *
 * Phrasing follows app/src/copy/punishment.ts: the debtor *takes* the
 * punishment and the creditor delivers it, so this says what physically happens
 * rather than who owes whom. That file cannot be imported across the app/
 * infrastructure boundary, so the rule is restated here — if the wording
 * changes there, change it here too.
 *
 * Second person for the individual events, third for the group ones, because a
 * group push has no single "you" to address.
 */
function render(
  event: NotificationEvent,
  nameOf: (id: string | undefined) => string
): { title: string; body: string } | null {
  const statement = event.statement?.trim();
  const quoted = statement ? `: “${truncate(statement, 80)}”` : '';

  switch (event.type) {
    case 'manchester_created':
      return {
        title: 'Manchester called',
        body: `${nameOf(event.actorId)} called a Manchester on you${quoted}`,
      };

    case 'confirmation_awaiting_you':
      return {
        title: 'Your turn',
        body: `${nameOf(event.actorId)} gave their answer. The Manchester is waiting on you${quoted}`,
      };

    case 'manchester_resolved':
      return {
        title: 'You owe a punishment',
        body:
          event.punishment === 'infinity_grog'
            ? 'You take a shot from the grog.'
            : `${nameOf(event.creditorId)} slaps you.`,
      };

    case 'manchester_settled':
      return {
        title: 'Settled',
        body:
          event.punishment === 'infinity_grog'
            ? `${nameOf(event.debtorId)} took their shot.`
            : `${nameOf(event.debtorId)} got slapped by ${nameOf(event.creditorId)}.`,
      };

    case 'grog_shot_taken':
      return {
        title: 'The grog claims another',
        // A free shot carries the drinker's reason as `statement`; a
        // Manchester shot's statement is the claim it settled, so only the
        // free one (no debtId) quotes it.
        body: `${nameOf(event.actorId)} took a shot from the Infinity Grog${event.debtId ? '.' : quoted || '.'}`,
      };

    case 'member_joined':
      return {
        title: 'New member',
        body: `${nameOf(event.joinedPlayerId)} joined the group.`,
      };

    // Neither push names the game or says what was called: a lock screen is
    // read by whoever is holding the phone, read in or not.
    case 'game_called':
      return {
        title: 'You got called',
        body: `${nameOf(event.actorId)} called you out. Were you covered?`,
      };

    case 'game_settled': {
      const chuggers = event.chuggerIds ?? [];
      return {
        title: 'Call settled',
        body:
          chuggers.length === 0
            ? 'Nobody drinks.'
            : `${chuggers.map((id) => nameOf(id)).join(', ')} ${chuggers.length === 1 ? 'chugs' : 'chug'}.`,
      };
    }

    default:
      return null;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

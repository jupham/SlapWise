import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

const sns = new SNSClient({});
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN;

/**
 * The events a mutation can raise for the notification dispatcher.
 *
 * Not every feed entry is here and not every one of these writes a feed entry.
 * The feed is a record of what happened; a notification is an interruption, so
 * the bar is higher. `chug_event` and `player_read_in` are deliberately absent:
 * they were both published before this existed and are now dropped on the floor
 * by the dispatcher rather than removed here, because the publish sites are the
 * natural place to reinstate them if that judgement changes.
 */
export type NotificationType =
  /** Someone called a Manchester naming you. Goes to the other party. */
  | 'manchester_created'
  /** The other party answered and it is now waiting on you. */
  | 'confirmation_awaiting_you'
  /** Both parties agreed. Goes to the debtor, who now owes the punishment. */
  | 'manchester_resolved'
  /** A punishment was delivered and confirmed by both parties. */
  | 'manchester_settled'
  /** Someone drank from the Infinity Grog. */
  | 'grog_shot_taken'
  /** A new member joined via invite code. */
  | 'member_joined';

/**
 * Who hears about it, stated by the publisher rather than inferred by the
 * dispatcher — the mutation is the only thing that knows whether an event is
 * somebody's turn or the group's entertainment.
 *
 * `group` excludes the actor by default at the call site rather than here: a
 * push telling you what you just did is the fastest way to get notifications
 * switched off.
 */
export type Audience =
  | { kind: 'players'; playerIds: string[] }
  | { kind: 'group'; excludePlayerIds?: string[] };

export interface NotificationEvent {
  type: NotificationType;
  groupId: string;
  audience: Audience;

  /**
   * Ids, never names — same rule as feed entries, for a different reason. There
   * the point is that a stored name goes stale on rename; here the message is
   * rendered once and never re-read, so staleness cannot happen. It is the
   * dispatcher that has to resolve them, because the device has no member list
   * to resolve against when the notification arrives.
   */
  debtId?: string;
  actorId?: string;
  debtorId?: string;
  creditorId?: string;
  joinedPlayerId?: string;

  statement?: string;
  punishment?: 'slap' | 'infinity_grog';
}

/**
 * Best-effort by design. A notification that fails to publish must never fail
 * the mutation that raised it — the Manchester still happened. Every existing
 * call site wrapped its own publish in a try/catch to get this; the swallow
 * lives here now so they do not have to.
 */
export async function publishNotification(event: NotificationEvent): Promise<void> {
  if (!SNS_TOPIC_ARN) return;

  try {
    await sns.send(
      new PublishCommand({
        TopicArn: SNS_TOPIC_ARN,
        Message: JSON.stringify(event),
      })
    );
  } catch (err) {
    console.error(`[notifications] failed to publish ${event.type}:`, err);
  }
}

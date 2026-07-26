import { getClient } from './amplifyClient';
import { ChugEvent, FeedEntry } from '../types';

const GET_FEED = /* GraphQL */ `
  query GetFeed($groupId: ID!) {
    getFeed(groupId: $groupId) {
      entryId groupId type readInOnly refId actorId summary createdAt
      statement challengerId statementMakerId debtorId creditorId
      outcome punishment amountMl
    }
  }
`;

const ON_CHUG_EVENT_CREATED = /* GraphQL */ `
  subscription OnChugEventCreated($groupId: ID!) {
    onChugEventCreated(groupId: $groupId) {
      eventId groupId callerId chuggedPlayerIds createdAt
    }
  }
`;

export const FeedService = {
  async getFeed(groupId: string): Promise<FeedEntry[]> {
    const result = await getClient().graphql({
      query: GET_FEED,
      variables: { groupId },
    });
    return (result as { data: { getFeed: FeedEntry[] } }).data.getFeed;
  },

  subscribeToChugEvents(
    groupId: string,
    onUpdate: (event: ChugEvent) => void
  ): { unsubscribe: () => void } {
    const sub = (
      getClient().graphql({ query: ON_CHUG_EVENT_CREATED, variables: { groupId } }) as unknown as {
        subscribe: (handlers: { next: (v: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: (event: unknown) => {
        const chug = (event as { data: { onChugEventCreated: ChugEvent } }).data?.onChugEventCreated;
        if (chug) onUpdate(chug);
      },
    });
    return sub;
  },
};

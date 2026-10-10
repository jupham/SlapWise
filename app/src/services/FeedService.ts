import { getClient } from './amplifyClient';
import { FeedEntry } from '../types';

const GET_FEED = /* GraphQL */ `
  query GetFeed($groupId: ID!) {
    getFeed(groupId: $groupId) {
      entryId groupId type readInOnly refId actorId summary createdAt
      statement challengerId statementMakerId debtorId creditorId
      outcome punishment amountMl
      calledPlayerIds chuggerIds redacted
    }
  }
`;

export const FeedService = {
  /**
   * Read-in game entries come back redacted for players who are not read in —
   * the server decides, not the app. There is deliberately no live
   * subscription: a subscription payload goes to every subscriber unfiltered,
   * which is how the old onChugEventCreated handed game details to everyone.
   * The feed refetches on focus instead, and the people involved get a push.
   */
  async getFeed(groupId: string): Promise<FeedEntry[]> {
    const result = await getClient().graphql({
      query: GET_FEED,
      variables: { groupId },
    });
    return (result as { data: { getFeed: FeedEntry[] } }).data.getFeed;
  },
};

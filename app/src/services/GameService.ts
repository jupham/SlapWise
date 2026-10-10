import { getClient } from './amplifyClient';
import { GameCall } from '../types';

const GAME_CALL_FIELDS = `
  callId groupId callerId calledPlayerIds
  answers { playerId answer }
  status chuggerIds backfired createdAt settledAt
`;

const GET_GAME_CALLS = /* GraphQL */ `
  query GetGameCalls($groupId: ID!) {
    getGameCalls(groupId: $groupId) { ${GAME_CALL_FIELDS} }
  }
`;

const CALL_GAME = /* GraphQL */ `
  mutation CallGame($groupId: ID!, $calledPlayerIds: [ID!]!) {
    callGame(groupId: $groupId, calledPlayerIds: $calledPlayerIds) { ${GAME_CALL_FIELDS} }
  }
`;

const RESPOND_TO_GAME_CALL = /* GraphQL */ `
  mutation RespondToGameCall($groupId: ID!, $callId: ID!, $covered: Boolean!) {
    respondToGameCall(groupId: $groupId, callId: $callId, covered: $covered) { ${GAME_CALL_FIELDS} }
  }
`;

/**
 * The read-in game. Every call here is refused server-side for a player who is
 * not read in, so only call these when the viewer is.
 */
export const GameService = {
  async getGameCalls(groupId: string): Promise<GameCall[]> {
    const result = await getClient().graphql({ query: GET_GAME_CALLS, variables: { groupId } });
    return (result as { data: { getGameCalls: GameCall[] } }).data.getGameCalls;
  },

  async callGame(groupId: string, calledPlayerIds: string[]): Promise<GameCall> {
    const result = await getClient().graphql({ query: CALL_GAME, variables: { groupId, calledPlayerIds } });
    return (result as { data: { callGame: GameCall } }).data.callGame;
  },

  async respondToGameCall(groupId: string, callId: string, covered: boolean): Promise<GameCall> {
    const result = await getClient().graphql({
      query: RESPOND_TO_GAME_CALL,
      variables: { groupId, callId, covered },
    });
    return (result as { data: { respondToGameCall: GameCall } }).data.respondToGameCall;
  },
};

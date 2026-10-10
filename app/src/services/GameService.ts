import { getClient } from './amplifyClient';
import { GameCall, ReadInRules } from '../types';

const GAME_CALL_FIELDS = `
  callId groupId callerId calledPlayerIds
  answers { playerId answer answeredBy }
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
  mutation RespondToGameCall($groupId: ID!, $callId: ID!, $covered: Boolean!, $playerId: ID) {
    respondToGameCall(groupId: $groupId, callId: $callId, covered: $covered, playerId: $playerId) {
      ${GAME_CALL_FIELDS}
    }
  }
`;

const GET_READ_IN_RULES = /* GraphQL */ `
  query GetReadInRules($groupId: ID!) {
    getReadInRules(groupId: $groupId) { groupId text updatedBy updatedAt }
  }
`;

const SET_READ_IN_RULES = /* GraphQL */ `
  mutation SetReadInRules($groupId: ID!, $text: String!) {
    setReadInRules(groupId: $groupId, text: $text) { groupId text updatedBy updatedAt }
  }
`;

/**
 * The read-in game. Every call here is refused server-side for a player who is
 * not read in, so only call these when the viewer is.
 */
export const GameService = {
  async getReadInRules(groupId: string): Promise<ReadInRules> {
    const result = await getClient().graphql({ query: GET_READ_IN_RULES, variables: { groupId } });
    return (result as { data: { getReadInRules: ReadInRules } }).data.getReadInRules;
  },

  /** Admins only, server-side. */
  async setReadInRules(groupId: string, text: string): Promise<ReadInRules> {
    const result = await getClient().graphql({ query: SET_READ_IN_RULES, variables: { groupId, text } });
    return (result as { data: { setReadInRules: ReadInRules } }).data.setReadInRules;
  },

  async getGameCalls(groupId: string): Promise<GameCall[]> {
    const result = await getClient().graphql({ query: GET_GAME_CALLS, variables: { groupId } });
    return (result as { data: { getGameCalls: GameCall[] } }).data.getGameCalls;
  },

  async callGame(groupId: string, calledPlayerIds: string[]): Promise<GameCall> {
    const result = await getClient().graphql({ query: CALL_GAME, variables: { groupId, calledPlayerIds } });
    return (result as { data: { callGame: GameCall } }).data.callGame;
  },

  /**
   * Records an answer. `playerId` defaults to your own; the caller may pass any
   * player they called, to settle it for them. The first answer in sticks.
   */
  async respondToGameCall(
    groupId: string,
    callId: string,
    covered: boolean,
    playerId?: string
  ): Promise<GameCall> {
    const result = await getClient().graphql({
      query: RESPOND_TO_GAME_CALL,
      variables: { groupId, callId, covered, playerId: playerId ?? null },
    });
    return (result as { data: { respondToGameCall: GameCall } }).data.respondToGameCall;
  },
};

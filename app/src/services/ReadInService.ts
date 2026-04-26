import { generateClient } from 'aws-amplify/api';
import { Member, Group } from '../types';

const client = generateClient({ authMode: 'userPool' });

const MEMBER_FIELDS = /* GraphQL */ `
  playerId groupId username joinedAt isReadIn readInConfirmedAt
`;

const CONFIRM_READ_IN = /* GraphQL */ `
  mutation ConfirmReadIn($groupId: ID!) {
    confirmReadIn(groupId: $groupId) {
      ${MEMBER_FIELDS}
    }
  }
`;

const GET_READ_IN_PLAYERS = /* GraphQL */ `
  query GetReadInPlayers($groupId: ID!) {
    getReadInPlayers(groupId: $groupId) {
      ${MEMBER_FIELDS}
    }
  }
`;

const SET_READ_IN_GAME_NAME = /* GraphQL */ `
  mutation SetReadInGameName($groupId: ID!, $name: String!) {
    setReadInGameName(groupId: $groupId, name: $name) {
      groupId name creatorId adminIds inviteCode readInGameName createdAt
    }
  }
`;

export const ReadInService = {
  async confirmReadIn(groupId: string): Promise<Member> {
    const result = await client.graphql({
      query: CONFIRM_READ_IN,
      variables: { groupId },
    });
    return (result as { data: { confirmReadIn: Member } }).data.confirmReadIn;
  },

  async getReadInPlayers(groupId: string): Promise<Member[]> {
    const result = await client.graphql({
      query: GET_READ_IN_PLAYERS,
      variables: { groupId },
    });
    return (result as { data: { getReadInPlayers: Member[] } }).data.getReadInPlayers;
  },

  async setReadInGameName(groupId: string, name: string): Promise<Group> {
    const result = await client.graphql({
      query: SET_READ_IN_GAME_NAME,
      variables: { groupId, name },
    });
    return (result as { data: { setReadInGameName: Group } }).data.setReadInGameName;
  },
};

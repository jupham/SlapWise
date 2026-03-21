import { generateClient } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { Group, Member } from '../types';

const client = generateClient({ authMode: 'userPool' });

const API_ENDPOINT = 'https://6oberjr6hf.execute-api.us-east-1.amazonaws.com/prod';

async function authFetch(path: string, options: RequestInit): Promise<Response> {
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');
  return fetch(`${API_ENDPOINT}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
      ...options.headers,
    },
  });
}

const GET_GROUPS = /* GraphQL */ `
  query GetGroups {
    getGroups {
      groupId name creatorId adminIds inviteCode readInGameName createdAt
    }
  }
`;

const GET_GROUP_MEMBERS = /* GraphQL */ `
  query GetGroupMembers($groupId: ID!) {
    getGroupMembers(groupId: $groupId) {
      playerId groupId username joinedAt isReadIn readInConfirmedAt
    }
  }
`;

const DESIGNATE_ADMIN = /* GraphQL */ `
  mutation DesignateAdmin($groupId: ID!, $playerId: ID!) {
    designateAdmin(groupId: $groupId, playerId: $playerId) {
      groupId adminIds
    }
  }
`;

const REGENERATE_INVITE = /* GraphQL */ `
  mutation RegenerateInviteCode($groupId: ID!) {
    regenerateInviteCode(groupId: $groupId) {
      groupId inviteCode
    }
  }
`;

export interface CreateGroupResponse {
  groupId: string;
  name: string;
  inviteCode: string;
  createdAt: string;
}

export interface JoinGroupResponse {
  groupId: string;
  name: string;
  inviteCode: string;
  joinedAt: string;
}


export const GroupService = {
  async createGroup(name: string): Promise<CreateGroupResponse> {
    const res = await authFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(err.message ?? 'Failed to create group');
    }
    return res.json() as Promise<CreateGroupResponse>;
  },

  async joinGroup(groupId: string, inviteCode: string): Promise<JoinGroupResponse> {
    const res = await authFetch('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ groupId, inviteCode }),
    });
    if (!res.ok) {
      const err = await res.json() as { code?: string; message?: string };
      throw new Error(err.code ?? err.message ?? 'Failed to join group');
    }
    return res.json() as Promise<JoinGroupResponse>;
  },

  async getGroups(): Promise<Group[]> {
    const result = await client.graphql({ query: GET_GROUPS });
    return (result as { data: { getGroups: Group[] } }).data.getGroups;
  },

  async getGroupMembers(groupId: string): Promise<Member[]> {
    const result = await client.graphql({ query: GET_GROUP_MEMBERS, variables: { groupId } });
    return (result as { data: { getGroupMembers: Member[] } }).data.getGroupMembers;
  },

  async designateAdmin(groupId: string, playerId: string): Promise<void> {
    await client.graphql({ query: DESIGNATE_ADMIN, variables: { groupId, playerId } });
  },

  async regenerateInviteCode(groupId: string): Promise<string> {
    const result = await client.graphql({ query: REGENERATE_INVITE, variables: { groupId } });
    return (result as { data: { regenerateInviteCode: { inviteCode: string } } }).data.regenerateInviteCode.inviteCode;
  },
};

import { fetchAuthSession, updateUserAttributes } from 'aws-amplify/auth';
import { getClient } from './amplifyClient';
import { Group, Member } from '../types';

async function authFetch(path: string, options: RequestInit): Promise<Response> {
  const { tokens } = await fetchAuthSession();
  const token = tokens?.idToken?.toString();
  if (!token) throw new Error('Not authenticated');

  // Import the REST endpoint from amplifyconfiguration at runtime
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require('../../amplifyconfiguration.json') as {
    API: { REST: { SlapWiseRest: { endpoint: string } } };
  };
  const base = config.API.REST.SlapWiseRest.endpoint.replace(/\/$/, '');

  return fetch(`${base}${path}`, {
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
  /**
   * Changes the player's display name.
   *
   * Two stores hold it: the Cognito preferred_username attribute, which
   * create-group and join-group read when writing a new Member record, and the
   * copies denormalised onto the Player profile and existing Member records.
   * Cognito goes first — if the fan-out fails, future joins still pick up the
   * new name and a retry converges; the reverse order could leave Cognito
   * permanently stale.
   */
  async updateUsername(username: string): Promise<void> {
    const trimmed = username.trim();
    await updateUserAttributes({
      userAttributes: { preferred_username: trimmed },
    });

    const res = await authFetch('/players/me/username', {
      method: 'PUT',
      body: JSON.stringify({ username: trimmed }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Failed to update display name: ${res.status} ${detail}`);
    }
  },

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

  async joinGroup(inviteCode: string): Promise<JoinGroupResponse> {
    const res = await authFetch('/groups/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode }),
    });
    if (!res.ok) {
      const err = await res.json() as { code?: string; message?: string };
      throw new Error(err.code ?? err.message ?? 'Failed to join group');
    }
    return res.json() as Promise<JoinGroupResponse>;
  },

  async getGroups(): Promise<Group[]> {
    const result = await getClient().graphql({ query: GET_GROUPS });
    return (result as { data: { getGroups: Group[] } }).data.getGroups;
  },

  async getGroupMembers(groupId: string): Promise<Member[]> {
    const result = await getClient().graphql({ query: GET_GROUP_MEMBERS, variables: { groupId } });
    return (result as { data: { getGroupMembers: Member[] } }).data.getGroupMembers;
  },

  async designateAdmin(groupId: string, playerId: string): Promise<void> {
    await getClient().graphql({ query: DESIGNATE_ADMIN, variables: { groupId, playerId } });
  },

  async regenerateInviteCode(groupId: string): Promise<string> {
    const result = await getClient().graphql({ query: REGENERATE_INVITE, variables: { groupId } });
    return (result as { data: { regenerateInviteCode: { inviteCode: string } } }).data.regenerateInviteCode.inviteCode;
  },

  async getGroup(groupId: string): Promise<Group> {
    const res = await authFetch(`/groups/${groupId}`, { method: 'GET' });
    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(err.message ?? 'Failed to fetch group');
    }
    return res.json() as Promise<Group>;
  },

  async deleteGroup(groupId: string): Promise<void> {
    const res = await authFetch(`/groups/${groupId}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json() as { message?: string };
      throw new Error(err.message ?? 'Failed to delete group');
    }
  },
};

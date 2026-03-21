import { generateClient } from 'aws-amplify/api';
import { SlapDebt } from '../types';

const client = generateClient({ authMode: 'userPool' });

const CREATE_CHALLENGE = /* GraphQL */ `
  mutation CreateChallenge($groupId: ID!, $statementMakerId: ID!, $statement: String!) {
    createChallenge(groupId: $groupId, statementMakerId: $statementMakerId, statement: $statement) {
      debtId groupId gameType status challengerId statementMakerId statement createdAt
      shameStatus debtorDeliveryConfirmed creditorDeliveryConfirmed
    }
  }
`;

const GET_PENDING_DEBTS = /* GraphQL */ `
  query GetPendingDebts($groupId: ID!) {
    getPendingDebts(groupId: $groupId) {
      debtId groupId gameType status challengerId statementMakerId statement createdAt
      shameStatus debtorDeliveryConfirmed creditorDeliveryConfirmed
    }
  }
`;

const ON_DEBT_UPDATED = /* GraphQL */ `
  subscription OnDebtUpdated($groupId: ID!) {
    onDebtUpdated(groupId: $groupId) {
      debtId groupId gameType status challengerId statementMakerId statement createdAt
      shameStatus debtorDeliveryConfirmed creditorDeliveryConfirmed
    }
  }
`;

export const ManchesterService = {
  async createChallenge(
    groupId: string,
    statementMakerId: string,
    statement: string
  ): Promise<SlapDebt> {
    const result = await client.graphql({
      query: CREATE_CHALLENGE,
      variables: { groupId, statementMakerId, statement },
    });
    return (result as { data: { createChallenge: SlapDebt } }).data.createChallenge;
  },

  async getPendingDebts(groupId: string): Promise<SlapDebt[]> {
    const result = await client.graphql({
      query: GET_PENDING_DEBTS,
      variables: { groupId },
    });
    return (result as { data: { getPendingDebts: SlapDebt[] } }).data.getPendingDebts;
  },

  subscribeToPendingDebts(
    groupId: string,
    onUpdate: (debt: SlapDebt) => void
  ): { unsubscribe: () => void } {
    const sub = (
      client.graphql({ query: ON_DEBT_UPDATED, variables: { groupId } }) as unknown as {
        subscribe: (handlers: { next: (v: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: (event: unknown) => {
        const debt = (event as { data: { onDebtUpdated: SlapDebt } }).data?.onDebtUpdated;
        if (debt) onUpdate(debt);
      },
    });
    return sub;
  },
};

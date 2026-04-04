import { generateClient } from 'aws-amplify/api';
import { Grog, LiquorCategory } from '../types';

const client = generateClient({ authMode: 'userPool' });

const GROG_FIELDS = /* GraphQL */ `
  groupId bottleSize
  entries { entryId category brand amountMl }
  history {
    eventId type actorPlayerId occurredAt
    sourceDebtId brand category amountMl
  }
`;

const GET_GROG = /* GraphQL */ `
  query GetGrog($groupId: ID!) {
    getGrog(groupId: $groupId) {
      ${GROG_FIELDS}
    }
  }
`;

const INITIALIZE_GROG = /* GraphQL */ `
  mutation InitializeGrog($groupId: ID!, $bottleSize: Float!, $seedEntries: [AddLiquorInput!]) {
    initializeGrog(groupId: $groupId, bottleSize: $bottleSize, seedEntries: $seedEntries) {
      ${GROG_FIELDS}
    }
  }
`;

const ADD_LIQUOR_TO_GROG = /* GraphQL */ `
  mutation AddLiquorToGrog($groupId: ID!, $category: LiquorCategory!, $brand: String!) {
    addLiquorToGrog(groupId: $groupId, category: $category, brand: $brand) {
      ${GROG_FIELDS}
    }
  }
`;

const REMOVE_LIQUOR_FROM_GROG = /* GraphQL */ `
  mutation RemoveLiquorFromGrog($groupId: ID!, $entryId: ID!) {
    removeLiquorFromGrog(groupId: $groupId, entryId: $entryId) {
      ${GROG_FIELDS}
    }
  }
`;

const ADJUST_GROG_ENTRY = /* GraphQL */ `
  mutation AdjustGrogEntry($groupId: ID!, $entryId: ID!, $amountMl: Float!) {
    adjustGrogEntry(groupId: $groupId, entryId: $entryId, amountMl: $amountMl) {
      ${GROG_FIELDS}
    }
  }
`;

const CONFIRM_GROG_DELIVERY = /* GraphQL */ `
  mutation ConfirmGrogDelivery($groupId: ID!, $debtId: ID!, $addBack: AddLiquorInput) {
    confirmGrogDelivery(groupId: $groupId, debtId: $debtId, addBack: $addBack) {
      ${GROG_FIELDS}
    }
  }
`;

export const GrogService = {
  async getGrog(groupId: string): Promise<Grog> {
    const result = await client.graphql({
      query: GET_GROG,
      variables: { groupId },
    });
    return (result as { data: { getGrog: Grog } }).data.getGrog;
  },

  async initializeGrog(
    groupId: string,
    bottleSize: number,
    seedEntries?: Array<{ category: LiquorCategory; brand: string; amountMl?: number }>
  ): Promise<Grog> {
    const result = await client.graphql({
      query: INITIALIZE_GROG,
      variables: { groupId, bottleSize, seedEntries },
    });
    return (result as { data: { initializeGrog: Grog } }).data.initializeGrog;
  },

  async addLiquor(groupId: string, category: LiquorCategory, brand: string): Promise<Grog> {
    const result = await client.graphql({
      query: ADD_LIQUOR_TO_GROG,
      variables: { groupId, category, brand },
    });
    return (result as { data: { addLiquorToGrog: Grog } }).data.addLiquorToGrog;
  },

  async removeLiquor(groupId: string, entryId: string): Promise<Grog> {
    const result = await client.graphql({
      query: REMOVE_LIQUOR_FROM_GROG,
      variables: { groupId, entryId },
    });
    return (result as { data: { removeLiquorFromGrog: Grog } }).data.removeLiquorFromGrog;
  },

  async adjustGrogEntry(groupId: string, entryId: string, amountMl: number): Promise<Grog> {
    const result = await client.graphql({
      query: ADJUST_GROG_ENTRY,
      variables: { groupId, entryId, amountMl },
    });
    return (result as { data: { adjustGrogEntry: Grog } }).data.adjustGrogEntry;
  },

  async confirmGrogDelivery(
    groupId: string,
    debtId: string,
    addBack?: { category: LiquorCategory; brand: string }
  ): Promise<Grog> {
    const result = await client.graphql({
      query: CONFIRM_GROG_DELIVERY,
      variables: { groupId, debtId, addBack },
    });
    return (result as { data: { confirmGrogDelivery: Grog } }).data.confirmGrogDelivery;
  },
};

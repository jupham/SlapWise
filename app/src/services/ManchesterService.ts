import { getClient } from './amplifyClient';
import { ChugEvent, SlapDebt, ResolutionOutcome, PunishmentType, PlayerDebtIndex } from '../types';

const DEBT_FIELDS = /* GraphQL */ `
  debtId groupId gameType status
  challengerId statementMakerId statement
  debtorId creditorId debtPunishment
  challengerConfirmation { outcome punishment submittedAt }
  statementMakerConfirmation { outcome punishment submittedAt }
  debtorDeliveryConfirmed creditorDeliveryConfirmed
  createdAt resolvedAt deliveredAt
`;

const PLAYER_DEBT_INDEX_FIELDS = /* GraphQL */ `
  debtId groupId playerId role status gameType
  statement challengerId statementMakerId
  debtorId creditorId debtPunishment createdAt
`;

const CREATE_CHALLENGE = /* GraphQL */ `
  mutation CreateChallenge($groupId: ID!, $statementMakerId: ID!, $statement: String!) {
    createChallenge(groupId: $groupId, statementMakerId: $statementMakerId, statement: $statement) {
      ${DEBT_FIELDS}
    }
  }
`;

const GET_DEBT = /* GraphQL */ `
  query GetDebt($groupId: ID!, $debtId: ID!) {
    getDebt(groupId: $groupId, debtId: $debtId) {
      ${DEBT_FIELDS}
    }
  }
`;

const GET_DEBTS_BY_STATUS = /* GraphQL */ `
  query GetDebtsByStatus($groupId: ID!, $status: DebtStatus!) {
    getDebts(groupId: $groupId, status: $status) {
      ${DEBT_FIELDS}
    }
  }
`;

/**
 * Statuses the feed needs debt state for. `delivered` is absent on purpose: a
 * settled thread reads entirely from its own entries.
 *
 * `status` looks optional on getDebts, but the resolver defaults a missing one
 * to "pending" and queries GSI2, whose partition key is
 * GROUP#<id>#STATUS#<status> — so one call can only ever return one status, and
 * omitting it quietly returns pending rather than everything.
 */
const FEED_DEBT_STATUSES = ['pending', 'pending_confirmation', 'resolved'] as const;

const GET_MY_DEBTS = /* GraphQL */ `
  query GetMyDebts($groupId: ID!) {
    getMyDebts(groupId: $groupId) {
      ${PLAYER_DEBT_INDEX_FIELDS}
    }
  }
`;

const SUBMIT_RESOLUTION = /* GraphQL */ `
  mutation SubmitResolutionConfirmation($debtId: String!, $groupId: ID!, $outcome: ResolutionOutcome!, $punishment: PunishmentType!) {
    submitResolutionConfirmation(debtId: $debtId, groupId: $groupId, outcome: $outcome, punishment: $punishment) {
      ${DEBT_FIELDS}
    }
  }
`;

const CONFIRM_DELIVERY = /* GraphQL */ `
  mutation ConfirmDelivery($debtId: String!, $groupId: ID!) {
    confirmDelivery(debtId: $debtId, groupId: $groupId) {
      ${DEBT_FIELDS}
    }
  }
`;

const VOID_DEBT = /* GraphQL */ `
  mutation VoidDebt($debtId: String!, $groupId: ID!) {
    voidDebt(debtId: $debtId, groupId: $groupId)
  }
`;

const RECORD_GAME_CALL = /* GraphQL */ `
  mutation RecordGameCall($groupId: ID!, $callerId: ID!, $chuggedPlayerIds: [ID!]!) {
    recordGameCall(groupId: $groupId, callerId: $callerId, chuggedPlayerIds: $chuggedPlayerIds) {
      eventId groupId callerId chuggedPlayerIds createdAt
    }
  }
`;

const ON_DEBT_UPDATED = /* GraphQL */ `
  subscription OnDebtUpdated($groupId: ID!) {
    onDebtUpdated(groupId: $groupId) {
      ${DEBT_FIELDS}
    }
  }
`;

export const ManchesterService = {
  async createChallenge(
    groupId: string,
    statementMakerId: string,
    statement: string
  ): Promise<SlapDebt> {
    const result = await getClient().graphql({
      query: CREATE_CHALLENGE,
      variables: { groupId, statementMakerId, statement },
    });
    return (result as { data: { createChallenge: SlapDebt } }).data.createChallenge;
  },

  async getDebt(groupId: string, debtId: string): Promise<SlapDebt> {
    const result = await getClient().graphql({
      query: GET_DEBT,
      variables: { groupId, debtId },
    });
    return (result as { data: { getDebt: SlapDebt } }).data.getDebt;
  },

  async getDebtsByStatus(groupId: string, status: string): Promise<SlapDebt[]> {
    const result = await getClient().graphql({
      query: GET_DEBTS_BY_STATUS,
      variables: { groupId, status },
    });
    return (result as { data: { getDebts: SlapDebt[] } }).data.getDebts;
  },

  /** Every debt the feed needs live state for, across the statuses above. */
  async getAllDebts(groupId: string): Promise<SlapDebt[]> {
    const pages = await Promise.all(
      FEED_DEBT_STATUSES.map((status) => this.getDebtsByStatus(groupId, status))
    );
    return pages.flat();
  },

  async getMyDebts(groupId: string): Promise<PlayerDebtIndex[]> {
    const result = await getClient().graphql({
      query: GET_MY_DEBTS,
      variables: { groupId },
    });
    return (result as { data: { getMyDebts: PlayerDebtIndex[] } }).data.getMyDebts;
  },

  async submitResolutionConfirmation(
    debtId: string,
    groupId: string,
    outcome: ResolutionOutcome,
    punishment: PunishmentType
  ): Promise<SlapDebt> {
    const result = await getClient().graphql({
      query: SUBMIT_RESOLUTION,
      variables: { debtId, groupId, outcome, punishment },
    });
    return (result as { data: { submitResolutionConfirmation: SlapDebt } }).data
      .submitResolutionConfirmation;
  },

  async confirmDelivery(debtId: string, groupId: string): Promise<SlapDebt> {
    const result = await getClient().graphql({
      query: CONFIRM_DELIVERY,
      variables: { debtId, groupId },
    });
    return (result as { data: { confirmDelivery: SlapDebt } }).data.confirmDelivery;
  },

  async voidDebt(debtId: string, groupId: string): Promise<void> {
    await getClient().graphql({
      query: VOID_DEBT,
      variables: { debtId, groupId },
    });
  },

  async recordGameCall(
    groupId: string,
    callerId: string,
    chuggedPlayerIds: string[]
  ): Promise<ChugEvent> {
    const result = await getClient().graphql({
      query: RECORD_GAME_CALL,
      variables: { groupId, callerId, chuggedPlayerIds },
    });
    return (result as { data: { recordGameCall: ChugEvent } }).data.recordGameCall;
  },

  subscribeToDebtUpdates(
    groupId: string,
    onUpdate: (debt: SlapDebt) => void
  ): { unsubscribe: () => void } {
    const sub = (
      getClient().graphql({ query: ON_DEBT_UPDATED, variables: { groupId } }) as unknown as {
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

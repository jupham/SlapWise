using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Services;

public class ManchesterService(HttpClient http, AuthService auth) : GraphQlService(http, auth)
{
    public async Task<List<SlapDebt>> GetDebtsAsync(string groupId, string status = "pending")
    {
        var data = await QueryAsync<GetDebtsResponse>("""
            query GetDebts($groupId: ID!, $status: DebtStatus) {
              getDebts(groupId: $groupId, status: $status) {
                debtId groupId gameType status challengerId statementMakerId statement
                debtorId creditorId debtPunishment
                challengerConfirmation { outcome punishment submittedAt }
                statementMakerConfirmation { outcome punishment submittedAt }
                debtorDeliveryConfirmed creditorDeliveryConfirmed
                createdAt resolvedAt deliveredAt
              }
            }
            """, new { groupId, status });
        return data.GetDebts;
    }

    public async Task<List<PlayerDebtIndex>> GetMyDebtsAsync(string groupId)
    {
        var data = await QueryAsync<GetMyDebtsResponse>("""
            query GetMyDebts($groupId: ID!) {
              getMyDebts(groupId: $groupId) {
                debtId groupId playerId role status gameType statement
                challengerId statementMakerId debtorId creditorId debtPunishment createdAt
              }
            }
            """, new { groupId });
        return data.GetMyDebts;
    }

    public async Task<SlapDebt> CreateChallengeAsync(string groupId, string statementMakerId, string statement)
    {
        var data = await MutateAsync<CreateChallengeResponse>("""
            mutation CreateChallenge($groupId: ID!, $statementMakerId: ID!, $statement: String!) {
              createChallenge(groupId: $groupId, statementMakerId: $statementMakerId, statement: $statement) {
                debtId groupId gameType status challengerId statementMakerId statement createdAt
              }
            }
            """, new { groupId, statementMakerId, statement });
        return data.CreateChallenge;
    }

    public async Task<SlapDebt> SubmitResolutionAsync(string groupId, string debtId, string outcome, string punishment)
    {
        var data = await MutateAsync<SubmitResolutionResponse>("""
            mutation SubmitResolution($debtId: String!, $groupId: ID!, $outcome: ResolutionOutcome!, $punishment: PunishmentType!) {
              submitResolutionConfirmation(debtId: $debtId, groupId: $groupId, outcome: $outcome, punishment: $punishment) {
                debtId status resolvedAt debtPunishment
              }
            }
            """, new { debtId, groupId, outcome, punishment });
        return data.SubmitResolutionConfirmation;
    }

    public async Task<SlapDebt> ConfirmDeliveryAsync(string groupId, string debtId)
    {
        var data = await MutateAsync<ConfirmDeliveryResponse>("""
            mutation ConfirmDelivery($debtId: String!, $groupId: ID!) {
              confirmDelivery(debtId: $debtId, groupId: $groupId) {
                debtId status deliveredAt debtorDeliveryConfirmed creditorDeliveryConfirmed
              }
            }
            """, new { debtId, groupId });
        return data.ConfirmDelivery;
    }

    private record GetDebtsResponse(List<SlapDebt> GetDebts);
    private record GetMyDebtsResponse(List<PlayerDebtIndex> GetMyDebts);
    private record CreateChallengeResponse(SlapDebt CreateChallenge);
    private record SubmitResolutionResponse(SlapDebt SubmitResolutionConfirmation);
    private record ConfirmDeliveryResponse(SlapDebt ConfirmDelivery);
}

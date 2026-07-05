using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Services;

public class GrogService(HttpClient http, AuthService auth) : GraphQlService(http, auth)
{
    private const string GrogFields = "groupId bottleSize entries { entryId category brand amountMl } history { eventId type actorPlayerId occurredAt sourceDebtId brand category amountMl } pendingAddBacks { debtId debtorId createdAt }";

    public async Task<Grog?> GetGrogAsync(string groupId)
    {
        var data = await QueryAsync<GetGrogResponse>(
            "query GetGrog($groupId: ID!) { getGrog(groupId: $groupId) { " + GrogFields + " } }",
            new { groupId });
        return data.GetGrog;
    }

    public async Task<Grog> InitializeGrogAsync(string groupId, double bottleSize)
    {
        var data = await MutateAsync<InitializeGrogResponse>(
            "mutation InitializeGrog($groupId: ID!, $bottleSize: Float!) { initializeGrog(groupId: $groupId, bottleSize: $bottleSize) { " + GrogFields + " } }",
            new { groupId, bottleSize });
        return data.InitializeGrog;
    }

    public async Task<Grog> AddLiquorAsync(string groupId, string category, string brand)
    {
        var data = await MutateAsync<AddLiquorResponse>(
            "mutation AddLiquor($groupId: ID!, $category: LiquorCategory!, $brand: String!) { addLiquorToGrog(groupId: $groupId, category: $category, brand: $brand) { " + GrogFields + " } }",
            new { groupId, category = category.ToLower(), brand });
        return data.AddLiquorToGrog;
    }

    public async Task<Grog> TakeShotAsync(string groupId, string debtId)
    {
        var data = await MutateAsync<TakeShotResponse>(
            "mutation TakeShot($groupId: ID!, $debtId: ID!) { takeGrogShot(groupId: $groupId, debtId: $debtId) { " + GrogFields + " } }",
            new { groupId, debtId });
        return data.TakeGrogShot;
    }

    public async Task<Grog> RemoveLiquorAsync(string groupId, string entryId)
    {
        var data = await MutateAsync<RemoveLiquorResponse>(
            "mutation RemoveLiquor($groupId: ID!, $entryId: ID!) { removeLiquorFromGrog(groupId: $groupId, entryId: $entryId) { " + GrogFields + " } }",
            new { groupId, entryId });
        return data.RemoveLiquorFromGrog;
    }

    private record GetGrogResponse(Grog? GetGrog);
    private record InitializeGrogResponse(Grog InitializeGrog);
    private record AddLiquorResponse(Grog AddLiquorToGrog);
    private record TakeShotResponse(Grog TakeGrogShot);
    private record RemoveLiquorResponse(Grog RemoveLiquorFromGrog);
}

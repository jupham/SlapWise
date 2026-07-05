using System.Net.Http.Json;
using System.Text.Json;
using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Services;

public class GroupService(HttpClient http, AuthService auth) : GraphQlService(http, auth)
{
    private const string RestBase = "https://6fwwfwnsp4.execute-api.us-east-1.amazonaws.com/prod";

    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };

    public async Task<List<Group>> GetMyGroupsAsync()
    {
        var data = await QueryAsync<GetGroupsResponse>("""
            query {
              getGroups {
                groupId name creatorId adminIds inviteCode readInGameName createdAt
              }
            }
            """);
        return data.GetGroups;
    }

    public async Task<List<Member>> GetMembersAsync(string groupId)
    {
        var data = await QueryAsync<GetGroupMembersResponse>("""
            query GetGroupMembers($groupId: ID!) {
              getGroupMembers(groupId: $groupId) {
                playerId groupId username joinedAt isReadIn
              }
            }
            """, new { groupId });
        return data.GetGroupMembers;
    }

    public async Task<Group> CreateGroupAsync(string name)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{RestBase}/groups");
        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {Auth.IdToken}");
        req.Content = JsonContent.Create(new { name });
        var resp = await http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();
        System.Diagnostics.Debug.WriteLine($"POST /groups → {(int)resp.StatusCode}: {body}");
        if (!resp.IsSuccessStatusCode) throw new Exception($"Create group failed: {body}");
        return JsonSerializer.Deserialize<Group>(body, JsonOpts)!;
    }

    public async Task<Group> JoinGroupAsync(string inviteCode)
    {
        var req = new HttpRequestMessage(HttpMethod.Post, $"{RestBase}/groups/join");
        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {Auth.IdToken}");
        req.Content = JsonContent.Create(new { inviteCode });
        var resp = await http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();
        System.Diagnostics.Debug.WriteLine($"POST /groups/join → {(int)resp.StatusCode}: {body}");
        if (!resp.IsSuccessStatusCode) throw new Exception($"Join group failed: {body}");
        return JsonSerializer.Deserialize<Group>(body, JsonOpts)!;
    }

    public async Task DeleteGroupAsync(string groupId)
    {
        var req = new HttpRequestMessage(HttpMethod.Delete, $"{RestBase}/groups/{groupId}");
        req.Headers.TryAddWithoutValidation("Authorization", $"Bearer {Auth.IdToken}");
        var resp = await http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();
        System.Diagnostics.Debug.WriteLine($"DELETE /groups/{groupId} → {(int)resp.StatusCode}: {body}");
        if (!resp.IsSuccessStatusCode) throw new Exception($"Delete group failed: {body}");
    }

    private record GetGroupsResponse(List<Group> GetGroups);
    private record GetGroupMembersResponse(List<Member> GetGroupMembers);
}

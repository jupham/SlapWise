using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Services;

public class FeedService(HttpClient http, AuthService auth) : GraphQlService(http, auth)
{
    public async Task<List<FeedEntry>> GetFeedAsync(string groupId)
    {
        var data = await QueryAsync<GetFeedResponse>("""
            query GetFeed($groupId: ID!) {
              getFeed(groupId: $groupId) {
                entryId groupId type readInOnly refId actorId summary createdAt
              }
            }
            """, new { groupId });
        return data.GetFeed;
    }

    private record GetFeedResponse(List<FeedEntry> GetFeed);
}

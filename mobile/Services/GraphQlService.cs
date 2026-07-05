using GraphQL;
using GraphQL.Client.Http;
using GraphQL.Client.Serializer.SystemTextJson;

namespace SlapWise.Mobile.Services;

public abstract class GraphQlService
{
    private const string AppSyncUrl =
        "https://ef6cfd5u2bb7jadocy3z4hg2c4.appsync-api.us-east-1.amazonaws.com/graphql";

    protected readonly AuthService Auth;
    private readonly HttpClient _http;

    protected GraphQlService(HttpClient http, AuthService auth)
    {
        _http = http;
        Auth = auth;
    }

    protected async Task<T> QueryAsync<T>(string query, object? variables = null)
    {
        var client = BuildClient();
        var request = new GraphQLRequest { Query = query, Variables = variables };
        var response = await client.SendQueryAsync<T>(request);
        LogResponse(response);
        if (response.Errors is { Length: > 0 })
            throw new Exception(response.Errors[0].Message);
        return response.Data;
    }

    protected async Task<T> MutateAsync<T>(string mutation, object? variables = null)
    {
        var client = BuildClient();
        var request = new GraphQLRequest { Query = mutation, Variables = variables };
        var response = await client.SendMutationAsync<T>(request);
        LogResponse(response);
        if (response.Errors is { Length: > 0 })
            throw new Exception(response.Errors[0].Message);
        return response.Data;
    }

    private GraphQLHttpClient BuildClient()
    {
        var client = new GraphQLHttpClient(
            new GraphQLHttpClientOptions { EndPoint = new Uri(AppSyncUrl) },
            new SystemTextJsonSerializer(),
            _http);
        if (Auth.IdToken is { } token)
        {
            client.HttpClient.DefaultRequestHeaders.Remove("Authorization");
            client.HttpClient.DefaultRequestHeaders.TryAddWithoutValidation("Authorization", token);
        }
        return client;
    }

    private static void LogResponse<T>(GraphQLResponse<T> response)
    {
        System.Diagnostics.Debug.WriteLine($"GraphQL response: {System.Text.Json.JsonSerializer.Serialize(response.Data)}");
        if (response.Errors is { Length: > 0 })
            foreach (var e in response.Errors)
                System.Diagnostics.Debug.WriteLine($"GraphQL error: {e.Message}");
    }
}

using System.Net.Http.Json;
using System.Text.Json;
using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Services;

public class AuthService
{
    private readonly HttpClient _http;
    private Player? _currentPlayer;

    // Cognito user pool settings — fill from amplifyconfiguration
    private const string UserPoolClientId = "22sbjq4qoap0244putbdqr2tsc";
    private const string CognitoRegion = "us-east-1";
    private static readonly string CognitoEndpoint =
        $"https://cognito-idp.{CognitoRegion}.amazonaws.com/";

    public AuthService(HttpClient http)
    {
        _http = http;
    }

    public Player? CurrentPlayer => _currentPlayer;
    public string? IdToken { get; private set; }

    public async Task<Player> LoginAsync(string email, string password)
    {
        var payload = new
        {
            AuthFlow = "USER_PASSWORD_AUTH",
            ClientId = UserPoolClientId,
            AuthParameters = new Dictionary<string, string>
            {
                ["USERNAME"] = email,
                ["PASSWORD"] = password
            }
        };

        var request = new HttpRequestMessage(HttpMethod.Post, CognitoEndpoint);
        request.Headers.Add("X-Amz-Target", "AWSCognitoIdentityProviderService.InitiateAuth");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/x-amz-json-1.1");

        var response = await _http.SendAsync(request);
        var json = await response.Content.ReadFromJsonAsync<JsonElement>();
        System.Diagnostics.Debug.WriteLine($"Cognito response: {json}");

        if (!response.IsSuccessStatusCode || !json.TryGetProperty("AuthenticationResult", out var authResult))
        {
            var msg = json.TryGetProperty("message", out var m) ? m.GetString()
                    : json.TryGetProperty("Message", out var m2) ? m2.GetString()
                    : $"Login failed ({response.StatusCode})";
            throw new Exception(msg);
        }
        IdToken = authResult.GetProperty("IdToken").GetString()!;

        // Decode sub + email from the ID token payload
        var parts = IdToken.Split('.');
        var claimsJson = System.Text.Encoding.UTF8.GetString(
            Convert.FromBase64String(PadBase64(parts[1])));
        var claims = JsonSerializer.Deserialize<JsonElement>(claimsJson);
        var sub = claims.GetProperty("sub").GetString()!;
        var resolvedEmail = claims.GetProperty("email").GetString()!;

        _currentPlayer = new Player(sub, resolvedEmail, resolvedEmail);
        return _currentPlayer;
    }

    public async Task RegisterAsync(string email, string password)
    {
        var payload = new
        {
            ClientId = UserPoolClientId,
            Username = email,
            Password = password,
            UserAttributes = new[] { new { Name = "email", Value = email } }
        };

        var request = new HttpRequestMessage(HttpMethod.Post, CognitoEndpoint);
        request.Headers.Add("X-Amz-Target", "AWSCognitoIdentityProviderService.SignUp");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/x-amz-json-1.1");

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            var msg = json.TryGetProperty("message", out var m) ? m.GetString() : "Registration failed";
            throw new Exception(msg);
        }
    }

    public async Task ConfirmEmailAsync(string email, string code)
    {
        var payload = new
        {
            ClientId = UserPoolClientId,
            Username = email,
            ConfirmationCode = code
        };

        var request = new HttpRequestMessage(HttpMethod.Post, CognitoEndpoint);
        request.Headers.Add("X-Amz-Target", "AWSCognitoIdentityProviderService.ConfirmSignUp");
        request.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/x-amz-json-1.1");

        var response = await _http.SendAsync(request);
        if (!response.IsSuccessStatusCode)
        {
            var json = await response.Content.ReadFromJsonAsync<JsonElement>();
            var msg = json.TryGetProperty("message", out var m) ? m.GetString() : "Confirmation failed";
            throw new Exception(msg);
        }
    }

    public void Logout()
    {
        _currentPlayer = null;
        IdToken = null;
    }

    private static string PadBase64(string s)
    {
        s = s.Replace('-', '+').Replace('_', '/');
        return (s.Length % 4) switch
        {
            2 => s + "==",
            3 => s + "=",
            _ => s
        };
    }
}

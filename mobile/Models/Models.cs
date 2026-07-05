using System.Text.Json.Serialization;

namespace SlapWise.Mobile.Models;

public record Player(string PlayerId, string Email, string Username);

public record Group(
    string GroupId,
    string Name,
    string CreatorId,
    List<string> AdminIds,
    string InviteCode,
    string? ReadInGameName,
    string CreatedAt);

public record Member(
    string PlayerId,
    string GroupId,
    string? Username,
    string JoinedAt,
    bool IsReadIn);

public record Confirmation(
    string Outcome,
    string Punishment,
    string SubmittedAt);

public record SlapDebt(
    string DebtId,
    string GroupId,
    string GameType,
    string Status,
    string ChallengerId,
    string StatementMakerId,
    string Statement,
    string? DebtorId,
    string? CreditorId,
    string? DebtPunishment,
    Confirmation? ChallengerConfirmation,
    Confirmation? StatementMakerConfirmation,
    bool DebtorDeliveryConfirmed,
    bool CreditorDeliveryConfirmed,
    string CreatedAt,
    string? ResolvedAt,
    string? DeliveredAt);

public record PlayerDebtIndex(
    string DebtId,
    string GroupId,
    string PlayerId,
    string Role,
    string Status,
    string GameType,
    string Statement,
    string ChallengerId,
    string StatementMakerId,
    string? DebtorId,
    string? CreditorId,
    string? DebtPunishment,
    string CreatedAt);

public record FeedEntry(
    string EntryId,
    string GroupId,
    string Type,
    bool ReadInOnly,
    string RefId,
    string ActorId,
    string Summary,
    string CreatedAt);

public enum LiquorCategory
{
    Vodka, Whiskey, Bourbon, Scotch, Irish_Whiskey, Canadian_Whiskey,
    Rum, Gin, Tequila, Brandy, Beer, Wine, Cider, Other
}

public record GrogEntry(
    string EntryId,
    LiquorCategory Category,
    string Brand,
    double AmountMl);

public record GrogHistoryEvent(
    string EventId,
    string Type,
    string ActorPlayerId,
    string OccurredAt,
    string? SourceDebtId,
    string? Brand,
    LiquorCategory? Category,
    double? AmountMl);

public record PendingAddBack(
    string DebtId,
    string DebtorId,
    string CreatedAt);

public record Grog(
    string GroupId,
    double BottleSize,
    List<GrogEntry> Entries,
    List<GrogHistoryEvent> History,
    List<PendingAddBack> PendingAddBacks);

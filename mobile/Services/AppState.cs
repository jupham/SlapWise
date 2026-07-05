using CommunityToolkit.Mvvm.ComponentModel;
using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Services;

/// Central observable state — replaces Zustand store. Inject as singleton.
public partial class AppState : ObservableObject
{
    [ObservableProperty] private Player? _player;
    [ObservableProperty] private List<Group> _groups = [];
    [ObservableProperty] private Group? _currentGroup;
    [ObservableProperty] private List<Member> _members = [];
    [ObservableProperty] private List<SlapDebt> _debts = [];
    [ObservableProperty] private List<FeedEntry> _feedEntries = [];
}

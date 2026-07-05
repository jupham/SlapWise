using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Models;
using SlapWise.Mobile.Services;

namespace SlapWise.Mobile.ViewModels;

public partial class FeedViewModel(FeedService feedService, AppState state) : ObservableObject
{
    [ObservableProperty] private List<FeedEntry> _entries = [];
    [ObservableProperty] private bool _isBusy;
    [ObservableProperty] private string _errorMessage = string.Empty;

    [RelayCommand]
    public async Task LoadAsync()
    {
        if (state.CurrentGroup is null) return;
        IsBusy = true;
        ErrorMessage = string.Empty;
        try
        {
            Entries = await feedService.GetFeedAsync(state.CurrentGroup.GroupId);
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    public static string DescribeEntry(FeedEntry e, List<Member> members)
    {
        string Name(string id) => members.FirstOrDefault(m => m.PlayerId == id)?.Username ?? id[..8];
        return $"{Name(e.ActorId)}: {e.Summary}";
    }
}

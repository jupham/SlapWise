using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Models;
using SlapWise.Mobile.Services;
using SlapWise.Mobile.Views.Groups;

namespace SlapWise.Mobile.ViewModels;

public partial class GroupListViewModel(GroupService groupService, AppState state) : ObservableObject
{
    [ObservableProperty] private string _inviteCode = string.Empty;
    [ObservableProperty] private string _newGroupName = string.Empty;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private bool _isBusy;

    public List<Group> Groups => state.Groups;

    [RelayCommand]
    private async Task JoinGroupAsync()
    {
        if (string.IsNullOrWhiteSpace(InviteCode)) return;
        IsBusy = true;
        ErrorMessage = string.Empty;
        try
        {
            var group = await groupService.JoinGroupAsync(InviteCode.Trim().ToUpper());
            state.Groups = [.. state.Groups, group];
            state.CurrentGroup = group;
            await Shell.Current.GoToAsync($"//{nameof(GroupHomePage)}");
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task CreateGroupAsync()
    {
        if (string.IsNullOrWhiteSpace(NewGroupName)) return;
        IsBusy = true;
        ErrorMessage = string.Empty;
        try
        {
            var group = await groupService.CreateGroupAsync(NewGroupName.Trim());
            state.Groups = [.. state.Groups, group];
            state.CurrentGroup = group;
            await Shell.Current.GoToAsync($"//{nameof(GroupHomePage)}");
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task SelectGroupAsync(Group group)
    {
        state.CurrentGroup = group;
        await Shell.Current.GoToAsync($"//{nameof(GroupHomePage)}");
    }
}

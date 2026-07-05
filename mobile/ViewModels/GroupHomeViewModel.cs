using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Models;
using SlapWise.Mobile.Services;

namespace SlapWise.Mobile.ViewModels;

public partial class GroupHomeViewModel(GroupService groupService, AppState state) : ObservableObject
{
    [ObservableProperty] private bool _isBusy;
    [ObservableProperty] private string _errorMessage = string.Empty;

    public Group? CurrentGroup => state.CurrentGroup;
    public List<Member> Members => state.Members;
    public bool IsAdmin => state.CurrentGroup is { } g && state.Player is { } p
        && (g.AdminIds.Contains(p.PlayerId) || g.CreatorId == p.PlayerId);

    public async Task LoadAsync()
    {
        if (state.CurrentGroup is null) return;
        IsBusy = true;
        try
        {
            var members = await groupService.GetMembersAsync(state.CurrentGroup.GroupId);
            state.Members = members;
            OnPropertyChanged(nameof(Members));
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task DeleteGroupAsync()
    {
        if (state.CurrentGroup is null) return;
        IsBusy = true;
        try
        {
            await groupService.DeleteGroupAsync(state.CurrentGroup.GroupId);
            state.Groups = state.Groups.Where(g => g.GroupId != state.CurrentGroup.GroupId).ToList();
            state.CurrentGroup = null;
            await Shell.Current.GoToAsync("//GroupListPage");
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }
}

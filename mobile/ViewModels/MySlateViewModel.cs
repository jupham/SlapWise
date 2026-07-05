using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Models;
using SlapWise.Mobile.Services;

namespace SlapWise.Mobile.ViewModels;

public partial class MySlateViewModel(ManchesterService manchesterService, AppState state)
    : ObservableObject
{
    [ObservableProperty] private List<PlayerDebtIndex> _myDebts = [];
    [ObservableProperty] private bool _isBusy;
    [ObservableProperty] private string _errorMessage = string.Empty;

    public string? PlayerId => state.Player?.PlayerId;

    [RelayCommand]
    public async Task LoadAsync()
    {
        if (state.CurrentGroup is null) return;
        IsBusy = true;
        ErrorMessage = string.Empty;
        try
        {
            MyDebts = await manchesterService.GetMyDebtsAsync(state.CurrentGroup.GroupId);
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task ResolveAsync(PlayerDebtIndex debt)
    {
        if (state.CurrentGroup is null) return;
        IsBusy = true;
        try
        {
            await manchesterService.SubmitResolutionAsync(
                state.CurrentGroup.GroupId, debt.DebtId, "followed_through", "slap");
            await LoadAsync();
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }
}

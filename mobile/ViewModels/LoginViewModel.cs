using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Services;
using SlapWise.Mobile.Views.Auth;
using SlapWise.Mobile.Views.Groups;

namespace SlapWise.Mobile.ViewModels;

public partial class LoginViewModel(AuthService auth, GroupService groupService, AppState state)
    : ObservableObject
{
    [ObservableProperty] private string _email = string.Empty;
    [ObservableProperty] private string _password = string.Empty;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private bool _isBusy;

    [RelayCommand]
    private async Task LoginAsync()
    {
        ErrorMessage = string.Empty;
        IsBusy = true;
        try
        {
            var player = await auth.LoginAsync(Email, Password);
            state.Player = player;

            List<Models.Group> groups;
            try
            {
                groups = await groupService.GetMyGroupsAsync();
                state.Groups = groups;
            }
            catch (Exception ex)
            {
                System.Diagnostics.Debug.WriteLine($"GetMyGroupsAsync failed: {ex}");
                groups = [];
            }

            if (groups.Count > 0)
            {
                state.CurrentGroup = groups[0];
                await Shell.Current.GoToAsync($"//{nameof(GroupHomePage)}");
            }
            else
            {
                await Shell.Current.GoToAsync($"//{nameof(GroupListPage)}");
            }
        }
        catch (Exception ex) when (ex.Message.Contains("Login") || ex.Message.Contains("Unauthorized") || ex.Message.Contains("auth"))
        {
            System.Diagnostics.Debug.WriteLine($"Login failed: {ex}");
            ErrorMessage = ex.Message;
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"Login error: {ex}");
            ErrorMessage = "Login failed. Please try again.";
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task GoToRegisterAsync()
    {
        await Shell.Current.GoToAsync(nameof(RegisterPage));
    }
}

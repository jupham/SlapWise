using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Services;
using SlapWise.Mobile.Views.Auth;

namespace SlapWise.Mobile.ViewModels;

public partial class RegisterViewModel(AuthService auth) : ObservableObject
{
    [ObservableProperty] private string _email = string.Empty;
    [ObservableProperty] private string _password = string.Empty;
    [ObservableProperty] private string _confirmCode = string.Empty;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private bool _isBusy;
    [ObservableProperty] private bool _awaitingConfirmation;

    [RelayCommand]
    private async Task RegisterAsync()
    {
        ErrorMessage = string.Empty;
        IsBusy = true;
        try
        {
            await auth.RegisterAsync(Email, Password);
            AwaitingConfirmation = true;
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }

    [RelayCommand]
    private async Task ConfirmAsync()
    {
        ErrorMessage = string.Empty;
        IsBusy = true;
        try
        {
            await auth.ConfirmEmailAsync(Email, ConfirmCode);
            await Shell.Current.GoToAsync($"//{nameof(LoginPage)}");
        }
        catch (Exception ex)
        {
            ErrorMessage = ex.Message;
        }
        finally
        {
            IsBusy = false;
        }
    }
}

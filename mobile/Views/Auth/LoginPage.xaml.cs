using SlapWise.Mobile.ViewModels;

namespace SlapWise.Mobile.Views.Auth;

public partial class LoginPage : ContentPage
{
    public LoginPage(LoginViewModel vm)
    {
        InitializeComponent();
        BindingContext = vm;
    }
}

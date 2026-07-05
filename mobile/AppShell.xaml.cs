using SlapWise.Mobile.Views.Auth;
using SlapWise.Mobile.Views.Groups;

namespace SlapWise.Mobile;

public partial class AppShell : Shell
{
    public AppShell()
    {
        InitializeComponent();

        Routing.RegisterRoute(nameof(LoginPage), typeof(LoginPage));
        Routing.RegisterRoute(nameof(RegisterPage), typeof(RegisterPage));
        Routing.RegisterRoute(nameof(GroupListPage), typeof(GroupListPage));
        Routing.RegisterRoute(nameof(GroupHomePage), typeof(GroupHomePage));
    }
}

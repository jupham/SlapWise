using SlapWise.Mobile.ViewModels;

namespace SlapWise.Mobile.Views.Groups;

public partial class GrogPage : ContentPage
{
    private readonly GrogViewModel _vm;

    public GrogPage(GrogViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.LoadAsync();
    }

    private void OnAddLiquorTapped(object sender, EventArgs e)
    {
        _vm.BeginAddLiquor();
        AddLiquorPopup.Show();
    }

    private async void OnAddLiquorConfirmed(object sender, EventArgs e)
    {
        AddLiquorPopup.Dismiss();
        await _vm.ConfirmAddLiquorAsync();
    }
}

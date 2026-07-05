using SlapWise.Mobile.ViewModels;

namespace SlapWise.Mobile.Views.Groups;

public partial class MyStatePage : ContentPage
{
    private readonly MySlateViewModel _vm;

    public MyStatePage(MySlateViewModel vm)
    {
        InitializeComponent();
        BindingContext = _vm = vm;
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await _vm.LoadAsync();
    }
}

using SlapWise.Mobile.ViewModels;

namespace SlapWise.Mobile.Views.Groups;

public partial class GroupListPage : ContentPage
{
    public GroupListPage(GroupListViewModel vm)
    {
        InitializeComponent();
        BindingContext = vm;
    }
}

namespace SlapWise.Mobile.Views.Groups;

public partial class GroupHomePage : TabbedPage
{
    public GroupHomePage(FeedPage feed, MyStatePage mySlate, GrogPage grog)
    {
        InitializeComponent();
        feed.Title = "Feed";
        mySlate.Title = "My Slate";
        grog.Title = "🍺 Grog";
        Children.Add(feed);
        Children.Add(mySlate);
        Children.Add(grog);
    }
}

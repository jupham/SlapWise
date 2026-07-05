using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SlapWise.Mobile.Models;
using SlapWise.Mobile.Services;

namespace SlapWise.Mobile.ViewModels;

public partial class GrogViewModel(GrogService grogService, AppState state) : ObservableObject
{
    [ObservableProperty] private Grog? _grog;
    [ObservableProperty] private bool _isBusy;
    [ObservableProperty] private string _errorMessage = string.Empty;
    [ObservableProperty] private int _sloshTrigger;

    // Add liquor picker state
    [ObservableProperty] private string _selectedCategory = string.Empty;
    [ObservableProperty] private string _selectedBrand = string.Empty;
    [ObservableProperty] private List<string> _brandsForCategory = [];

    public bool IsAdmin => state.CurrentGroup is { } g && state.Player is { } p
        && (g.AdminIds.Contains(p.PlayerId) || g.CreatorId == p.PlayerId);

    public List<string> CategoryNames { get; } =
        Enum.GetNames<LiquorCategory>().ToList();

    partial void OnSelectedCategoryChanged(string value)
    {
        if (Enum.TryParse<LiquorCategory>(value, out var cat))
            BrandsForCategory = GrogBrands.ForCategory(cat);
        else
            BrandsForCategory = [];
        SelectedBrand = string.Empty;
    }

    public void BeginAddLiquor()
    {
        SelectedCategory = string.Empty;
        SelectedBrand = string.Empty;
        BrandsForCategory = [];
    }

    public async Task ConfirmAddLiquorAsync()
    {
        if (state.CurrentGroup is null) return;
        if (!Enum.TryParse<LiquorCategory>(SelectedCategory, out var cat)) return;
        var brand = SelectedBrand.Trim();
        if (string.IsNullOrEmpty(brand)) return;

        IsBusy = true;
        try
        {
            Grog = await grogService.AddLiquorAsync(state.CurrentGroup.GroupId, cat.ToString(), brand);
            SloshTrigger++;
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    public async Task LoadAsync()
    {
        if (state.CurrentGroup is null) return;
        IsBusy = true;
        ErrorMessage = string.Empty;
        try { Grog = await grogService.GetGrogAsync(state.CurrentGroup.GroupId); }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task TakeShotAsync()
    {
        if (state.CurrentGroup is null) return;
        var debtId = Grog?.PendingAddBacks.FirstOrDefault()?.DebtId;
        if (debtId is null) { ErrorMessage = "No pending grog debt to take a shot for."; return; }
        IsBusy = true;
        try
        {
            Grog = await grogService.TakeShotAsync(state.CurrentGroup.GroupId, debtId);
            SloshTrigger++;
        }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task InitializeAsync(string bottleSizeStr)
    {
        if (state.CurrentGroup is null) return;
        if (!double.TryParse(bottleSizeStr, out var size)) size = 750;
        IsBusy = true;
        try { Grog = await grogService.InitializeGrogAsync(state.CurrentGroup.GroupId, size); }
        catch (Exception ex) { ErrorMessage = ex.Message; }
        finally { IsBusy = false; }
    }
}

// Brand lookup — mirrors the RN constants
internal static class GrogBrands
{
    private static readonly Dictionary<LiquorCategory, List<string>> _brands = new()
    {
        [LiquorCategory.Whiskey]          = ["Jack Daniel's", "Johnnie Walker", "Wild Turkey", "Buffalo Trace"],
        [LiquorCategory.Bourbon]          = ["Maker's Mark", "Bulleit", "Woodford Reserve", "Jim Beam"],
        [LiquorCategory.Scotch]           = ["Glenfiddich", "Macallan", "Laphroaig", "Glenlivet"],
        [LiquorCategory.Irish_Whiskey]    = ["Jameson", "Bushmills", "Redbreast", "Tullamore D.E.W."],
        [LiquorCategory.Canadian_Whiskey] = ["Crown Royal", "Canadian Club", "Seagram's"],
        [LiquorCategory.Vodka]            = ["Tito's", "Grey Goose", "Absolut", "Smirnoff", "Belvedere", "Ketel One"],
        [LiquorCategory.Rum]              = ["Bacardi", "Captain Morgan", "Malibu", "Kraken", "Mount Gay", "Havana Club"],
        [LiquorCategory.Gin]              = ["Tanqueray", "Hendrick's", "Bombay Sapphire", "Beefeater", "The Botanist"],
        [LiquorCategory.Tequila]          = ["Jose Cuervo", "Patron", "Don Julio", "Casamigos", "1800"],
        [LiquorCategory.Brandy]           = ["Hennessy", "Rémy Martin", "Courvoisier", "E&J"],
        [LiquorCategory.Beer]             = ["Budweiser", "Coors Light", "Corona", "Heineken", "Guinness"],
        [LiquorCategory.Wine]             = ["Barefoot", "Yellow Tail", "Josh", "Kendall-Jackson"],
        [LiquorCategory.Cider]            = ["Angry Orchard", "Strongbow", "Woodchuck", "Magners"],
        [LiquorCategory.Other]            = ["Other"],
    };

    public static List<string> ForCategory(LiquorCategory cat) =>
        _brands.TryGetValue(cat, out var list) ? list : [];
}

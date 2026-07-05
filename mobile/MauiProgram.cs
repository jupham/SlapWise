using CommunityToolkit.Maui;
using Microsoft.Extensions.Logging;
using SkiaSharp.Views.Maui.Controls.Hosting;
using Syncfusion.Maui.Core.Hosting;
using SlapWise.Mobile.Services;
using SlapWise.Mobile.ViewModels;
using SlapWise.Mobile.Views.Auth;
using SlapWise.Mobile.Views.Groups;

namespace SlapWise.Mobile;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var builder = MauiApp.CreateBuilder();
        builder
            .UseMauiApp<App>()
            .UseMauiCommunityToolkit()
            .UseSkiaSharp()
            .ConfigureSyncfusionCore()
            .ConfigureFonts(fonts =>
            {
                fonts.AddFont("OpenSans-Regular.ttf", "OpenSansRegular");
                fonts.AddFont("OpenSans-Semibold.ttf", "OpenSansSemibold");
            });

        // Register your Syncfusion license key here once you have it:
        Syncfusion.Licensing.SyncfusionLicenseProvider.RegisterLicense("Ngo9BigBOggjHTQxAR8/V1JHaF1cXmhOYVZpR2NbeU51flVCal1ZVBYiSV9jS3hTcEdrWHhedHVdRGheV091XA==");



        // Services
        builder.Services.AddSingleton<HttpClient>();
        builder.Services.AddSingleton<AuthService>();
        builder.Services.AddSingleton<AppState>();
        builder.Services.AddSingleton<GroupService>();
        builder.Services.AddSingleton<GrogService>();
        builder.Services.AddSingleton<ManchesterService>();
        builder.Services.AddSingleton<FeedService>();

        // ViewModels
        builder.Services.AddTransient<LoginViewModel>();
        builder.Services.AddTransient<RegisterViewModel>();
        builder.Services.AddTransient<GroupListViewModel>();
        builder.Services.AddTransient<GroupHomeViewModel>();
        builder.Services.AddTransient<FeedViewModel>();
        builder.Services.AddTransient<MySlateViewModel>();
        builder.Services.AddTransient<GrogViewModel>();

        // Views
        builder.Services.AddTransient<LoginPage>();
        builder.Services.AddTransient<RegisterPage>();
        builder.Services.AddTransient<GroupListPage>();
        builder.Services.AddTransient<GroupHomePage>();
        builder.Services.AddTransient<FeedPage>();
        builder.Services.AddTransient<MyStatePage>();
        builder.Services.AddTransient<GrogPage>();

#if DEBUG
        builder.Logging.AddDebug();
#endif

        return builder.Build();
    }
}

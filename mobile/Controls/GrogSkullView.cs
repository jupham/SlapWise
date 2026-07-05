using SkiaSharp;
using SkiaSharp.Views.Maui;
using SkiaSharp.Views.Maui.Controls;
using SlapWise.Mobile.Models;

namespace SlapWise.Mobile.Controls;

public class GrogSkullView : SKCanvasView
{
    // ── Bindable properties ───────────────────────────────────────────────────

    public static readonly BindableProperty EntriesProperty =
        BindableProperty.Create(nameof(Entries), typeof(List<GrogEntry>), typeof(GrogSkullView),
            null, propertyChanged: (b, _, _) => ((GrogSkullView)b).InvalidateSurface());

    public static readonly BindableProperty BottleSizeProperty =
        BindableProperty.Create(nameof(BottleSize), typeof(double), typeof(GrogSkullView),
            750.0, propertyChanged: (b, _, _) => ((GrogSkullView)b).InvalidateSurface());

    public static readonly BindableProperty SloshTriggerProperty =
        BindableProperty.Create(nameof(SloshTrigger), typeof(int), typeof(GrogSkullView),
            0, propertyChanged: (b, _, _) => ((GrogSkullView)b).TriggerSlosh());

    public List<GrogEntry>? Entries
    {
        get => (List<GrogEntry>?)GetValue(EntriesProperty);
        set => SetValue(EntriesProperty, value);
    }
    public double BottleSize
    {
        get => (double)GetValue(BottleSizeProperty);
        set => SetValue(BottleSizeProperty, value);
    }
    public int SloshTrigger
    {
        get => (int)GetValue(SloshTriggerProperty);
        set => SetValue(SloshTriggerProperty, value);
    }

    // ── Spring animation ──────────────────────────────────────────────────────

    private const float MaxTilt = 18f;
    private const float Damping = 2f;
    private const float Stiffness = 25f;
    private const float Mass = 2f;

    private float _tilt;
    private float _tiltVel;
    private float _tiltTarget;
    private IDispatcherTimer? _timer;

    public GrogSkullView()
    {
        // Gentle slosh on first draw
        Loaded += (_, _) =>
        {
            _tiltTarget = MaxTilt * 0.4f;
            _tiltVel = MaxTilt * 3f;
            StartTimer();
        };
    }

    private void TriggerSlosh()
    {
        _tiltTarget = MaxTilt;
        _tiltVel = MaxTilt * 8f;
        StartTimer();
        // Release back to 0 after 80ms
        Application.Current?.Dispatcher.DispatchDelayed(
            TimeSpan.FromMilliseconds(80), () => _tiltTarget = 0);
    }

    private void StartTimer()
    {
        if (_timer != null) return;
        _timer = Application.Current!.Dispatcher.CreateTimer();
        _timer.Interval = TimeSpan.FromMilliseconds(16); // ~60fps
        _timer.Tick += OnTick;
        _timer.Start();
    }

    private void OnTick(object? sender, EventArgs e)
    {
        const float dt = 0.016f;
        var force = -Stiffness * (_tilt - _tiltTarget) - Damping * _tiltVel;
        _tiltVel += (force / Mass) * dt;
        _tilt += _tiltVel * dt;

        if (Math.Abs(_tilt - _tiltTarget) < 0.01f && Math.Abs(_tiltVel) < 0.01f)
        {
            _tilt = _tiltTarget;
            _tiltVel = 0;
            _timer?.Stop();
            _timer = null;
        }

        InvalidateSurface();
    }

    // ── Drawing ───────────────────────────────────────────────────────────────

    private const float SkullVb = 226.452f;
    private const float SkullOffset = 48f;
    private const float LiquidMaxFill = 0.9f;

    private static readonly Dictionary<LiquorCategory, SKColor> CategoryColors = new()
    {
        [LiquorCategory.Whiskey]          = SKColor.Parse("#b8860b"),
        [LiquorCategory.Bourbon]          = SKColor.Parse("#c8720a"),
        [LiquorCategory.Scotch]           = SKColor.Parse("#a0720b"),
        [LiquorCategory.Irish_Whiskey]    = SKColor.Parse("#c8960b"),
        [LiquorCategory.Canadian_Whiskey] = SKColor.Parse("#b07820"),
        [LiquorCategory.Vodka]            = SKColor.Parse("#aaddff"),
        [LiquorCategory.Rum]              = SKColor.Parse("#8b4513"),
        [LiquorCategory.Gin]              = SKColor.Parse("#98fb98"),
        [LiquorCategory.Tequila]          = SKColor.Parse("#ffd700"),
        [LiquorCategory.Brandy]           = SKColor.Parse("#722f37"),
        [LiquorCategory.Beer]             = SKColor.Parse("#f4a460"),
        [LiquorCategory.Wine]             = SKColor.Parse("#800020"),
        [LiquorCategory.Cider]            = SKColor.Parse("#ff8c42"),
        [LiquorCategory.Other]            = SKColor.Parse("#888888"),
    };

    protected override void OnPaintSurface(SKPaintSurfaceEventArgs e)
    {
        var canvas = e.Surface.Canvas;
        var info = e.Info;
        canvas.Clear(SKColors.Transparent);

        // Scale canvas to fit our viewBox
        float scale = Math.Min(info.Width / SkullVb, info.Height / (SkullVb + SkullOffset));
        canvas.Save();
        canvas.Scale(scale);

        DrawSkull(canvas);

        canvas.Restore();
    }

    private void DrawSkull(SKCanvas canvas)
    {
        var vbH = SkullVb + SkullOffset;

        // Skull path
        using var skullPath = SKPath.ParseSvgPathData(
            "M113.226,0C58.74,0,14.411,43.405,14.411,96.757c0,36.036,20.92,69.514,53.525,86.017" +
            "v39.561c0,2.274,1.842,4.117,4.117,4.117h86.463c2.276,0,4.117-1.844,4.117-4.117" +
            "v-41.766c30.542-17.287,49.408-49.175,49.408-83.812C212.041,43.405,167.712,0,113.226,0z");
        skullPath.Transform(SKMatrix.CreateTranslation(0, SkullOffset));

        // Dark fill
        using var fillPaint = new SKPaint { Color = new SKColor(17, 17, 17), IsAntialias = true };
        canvas.DrawPath(skullPath, fillPaint);

        // Liquid layers
        var entries = Entries ?? [];
        var layers = ComputeLayers(entries, (float)BottleSize);
        canvas.Save();
        canvas.ClipPath(skullPath);
        foreach (var (category, hFrac, yFromBot) in layers)
        {
            if (!CategoryColors.TryGetValue(category, out var color))
                color = SKColors.Gray;
            using var paint = new SKPaint { Color = color, IsAntialias = true };
            canvas.DrawPath(LayerPath(hFrac, yFromBot, _tilt, vbH), paint);
        }
        canvas.Restore();

        // Skull outline
        using var strokePaint = new SKPaint
        {
            Color = SKColors.White, IsAntialias = true,
            Style = SKPaintStyle.Stroke, StrokeWidth = 2f
        };
        canvas.DrawPath(skullPath, strokePaint);

        // Eyes, nose, teeth
        DrawFeatures(canvas);
    }

    private static SKPath LayerPath(float heightFrac, float yFromBot, float tilt, float vbH)
    {
        var heightPx = heightFrac * SkullVb;
        var baseY = SkullOffset + SkullVb - yFromBot;
        var topY = baseY - heightPx;
        var extendedBottom = vbH + Math.Abs(tilt) + 10;
        var builder = new SKPathBuilder();
        builder.MoveTo(0, extendedBottom);
        builder.LineTo(SkullVb, extendedBottom);
        builder.LineTo(SkullVb, topY + tilt);
        builder.LineTo(0, topY - tilt);
        builder.Close();
        return builder.Snapshot();
    }

    private static List<(LiquorCategory, float hFrac, float yFromBot)> ComputeLayers(
        List<GrogEntry> entries, float bottleSize)
    {
        if (entries.Count == 0 || bottleSize <= 0) return [];
        var total = entries.Sum(e => e.AmountMl);
        if (total <= 0) return [];
        var fillLevel = (float)Math.Min(total / bottleSize, 1) * LiquidMaxFill;
        var result = new List<(LiquorCategory, float, float)>();
        float yFromBot = 0;
        foreach (var e in entries)
        {
            var frac = (float)(e.AmountMl / total) * fillLevel;
            result.Add((e.Category, frac, yFromBot));
            yFromBot += frac * SkullVb;
        }
        return result;
    }

    private static void DrawFeatures(SKCanvas canvas)
    {
        using var darkPaint = new SKPaint { Color = new SKColor(17, 17, 17), IsAntialias = true };
        using var detailPaint = new SKPaint
        {
            Color = new SKColor(204, 204, 204), IsAntialias = true,
            Style = SKPaintStyle.Stroke, StrokeWidth = 0.5f
        };

        void DrawDetail(string d)
        {
            using var p = SKPath.ParseSvgPathData(d);
            p.Transform(SKMatrix.CreateTranslation(0, SkullOffset));
            canvas.DrawPath(p, darkPaint);
            canvas.DrawPath(p, detailPaint);
        }

        // Left eye
        DrawDetail("M104.899,101.552c-1.347-6.942-5.686-13.544-11.897-18.116" +
            "c-6.409-4.716-14.065-6.65-20.973-5.303c-9.831,1.91-17.149,12.364-19.835,16.771" +
            "c-5.464,8.946-7.929,18.373-6.598,25.212c0.985,5.087,4.536,11.377,15.826,12.466" +
            "c1.222,0.119,2.481,0.173,3.76,0.173c5.476,0,11.387-0.979,17.056-2.083" +
            "c7.121-1.383,13.361-4.869,17.571-9.815C104.452,115.403,106.262,108.546,104.899,101.552z" +
            "M93.536,115.52c-3.004,3.53-7.575,6.041-12.867,7.071" +
            "c-6.389,1.241-13.04,2.314-18.46,1.795c-6.642-0.641-8.042-3.311-8.532-5.84" +
            "c-0.921-4.732,1.255-12.33,5.541-19.352c4.286-7.018,9.931-12.113,14.378-12.979" +
            "c0.933-0.181,1.886-0.269,2.859-0.269c3.892,0,8.014,1.437,11.668,4.123" +
            "c4.564,3.359,7.732,8.118,8.693,13.054C97.935,108.871,95.651,113.037,93.536,115.52z");

        // Right eye
        DrawDetail("M174.258,94.903c-2.686-4.407-10.004-14.861-19.835-16.771" +
            "c-6.912-1.355-14.563,0.587-20.973,5.303c-6.212,4.572-10.551,11.174-11.897,18.114" +
            "c-1.363,6.996,0.446,13.854,5.09,19.308c4.21,4.946,10.45,8.432,17.571,9.815" +
            "c5.67,1.104,11.58,2.083,17.056,2.083c1.278,0,2.537-0.054,3.76-0.173" +
            "c11.29-1.089,14.841-7.38,15.826-12.464C182.187,113.276,179.722,103.85,174.258,94.903z" +
            "M172.774,118.548c-0.49,2.527-1.89,5.197-8.532,5.838" +
            "c-5.42,0.515-12.07-0.555-18.46-1.795c-5.292-1.029-9.863-3.54-12.867-7.071" +
            "c-2.115-2.483-4.399-6.648-3.281-12.4c0.961-4.933,4.129-9.692,8.693-13.051" +
            "c4.568-3.361,9.859-4.76,14.527-3.854c4.447,0.866,10.092,5.961,14.378,12.979" +
            "C171.52,106.216,173.695,113.813,172.774,118.548z");

        // Nose
        using var nose1 = SKPath.ParseSvgPathData("M100.874,135.871h8.235v16.469h-8.235z");
        nose1.Transform(SKMatrix.CreateTranslation(0, SkullOffset));
        canvas.DrawPath(nose1, darkPaint);

        using var nose2 = SKPath.ParseSvgPathData("M117.343,135.871h8.235v16.469h-8.235z");
        nose2.Transform(SKMatrix.CreateTranslation(0, SkullOffset));
        canvas.DrawPath(nose2, darkPaint);

        // Teeth
        DrawDetail("M92.639,185.279c-2.276,0-4.117,1.844-4.117,4.117v20.587c0,2.274,1.842,4.117,4.117,4.117" +
            "c2.275,0,4.117-1.844,4.117-4.117v-20.587C96.757,187.122,94.915,185.279,92.639,185.279z");
        DrawDetail("M113.226,185.279c-2.276,0-4.117,1.844-4.117,4.117v20.587c0,2.274,1.842,4.117,4.117,4.117" +
            "c2.275,0,4.117-1.844,4.117-4.117v-20.587C117.343,187.122,115.502,185.279,113.226,185.279z");
        DrawDetail("M133.812,185.279c-2.276,0-4.117,1.844-4.117,4.117v20.587c0,2.274,1.842,4.117,4.117,4.117" +
            "s4.117-1.844,4.117-4.117v-20.587C137.93,187.122,136.088,185.279,133.812,185.279z");
    }
}

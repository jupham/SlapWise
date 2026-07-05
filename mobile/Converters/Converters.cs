using System.Globalization;

namespace SlapWise.Mobile.Converters;

public class InvertedBoolConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) => value is bool b && !b;
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => value is bool b && !b;
}

public class NotNullOrEmptyConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) =>
        value is string s && !string.IsNullOrEmpty(s);
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotImplementedException();
}

public class NullToBoolConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) => value is null;
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotImplementedException();
}

public class NotNullToBoolConverter : IValueConverter
{
    public object Convert(object? value, Type t, object? p, CultureInfo c) => value is not null;
    public object ConvertBack(object? value, Type t, object? p, CultureInfo c) => throw new NotImplementedException();
}

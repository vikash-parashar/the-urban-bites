import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One set of brand colours. The night palette is the cart's banners (navy, LED blue, mustard
/// gold); the day palette keeps the same hues on a light background.
class Palette {
  const Palette({
    required this.night,
    required this.ink,
    required this.ink2,
    required this.line,
    required this.neonGlow,
    required this.gold,
    required this.cream,
    required this.muted,
    required this.danger,
    required this.brightness,
  });
  final Color night, ink, ink2, line, neonGlow, gold, cream, muted, danger;
  final Brightness brightness;

  static const dark = Palette(
    night: Color(0xFF070A1C),
    ink: Color(0xFF0F1433),
    ink2: Color(0xFF171D45),
    line: Color(0xFF262D63),
    neonGlow: Color(0xFF7D93FF),
    gold: Color(0xFFF4B43A),
    cream: Color(0xFFF7F0E1),
    muted: Color(0xFFA4ABD0),
    danger: Color(0xFFFF6B6B),
    brightness: Brightness.dark,
  );

  static const light = Palette(
    night: Color(0xFFF4F1EA),
    ink: Color(0xFFFFFFFF),
    ink2: Color(0xFFE9ECFA),
    line: Color(0xFFD9DDEE),
    neonGlow: Color(0xFF3550E8),
    gold: Color(0xFFE9A21F),
    cream: Color(0xFF0E1438),
    muted: Color(0xFF5B648E),
    danger: Color(0xFFD93636),
    brightness: Brightness.light,
  );
}

/// Day or night mode, remembered on the phone. "system" follows the phone's own setting.
class ThemeController extends ChangeNotifier {
  ThemeController._();
  static final instance = ThemeController._();
  static const _key = 'theme_mode';

  ThemeMode mode = ThemeMode.system;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    mode = ThemeMode.values.firstWhere((m) => m.name == p.getString(_key), orElse: () => ThemeMode.system);
    _apply();
  }

  bool get isDark => Brand.p.brightness == Brightness.dark;

  Future<void> toggle() => set(isDark ? ThemeMode.light : ThemeMode.dark);

  Future<void> set(ThemeMode m) async {
    mode = m;
    _apply();
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, m.name);
  }

  /// Called when the phone switches between light and dark while the app follows the system.
  void systemChanged() {
    if (mode != ThemeMode.system) return;
    final before = Brand.p;
    _apply();
    if (before != Brand.p) notifyListeners();
  }

  void _apply() {
    final sys = WidgetsBinding.instance.platformDispatcher.platformBrightness;
    final dark = mode == ThemeMode.dark || (mode == ThemeMode.system && sys == Brightness.dark);
    Brand.p = dark ? Palette.dark : Palette.light;
  }
}

/// Brand colours for the current mode. Widgets read these while building, and the app rebuilds
/// everything when the mode changes.
class Brand {
  static Palette p = Palette.dark;
  static Color get night => p.night;
  static Color get ink => p.ink;
  static Color get ink2 => p.ink2;
  static Color get line => p.line;
  static Color get neonGlow => p.neonGlow;
  static Color get gold => p.gold;
  static Color get cream => p.cream;
  static Color get muted => p.muted;
  static Color get danger => p.danger;

  static const neon = Color(0xFF3D5CFF);
  static const ok = Color(0xFF2FBF71);

  /// Text and icons placed on gold, in both modes.
  static const onGold = Color(0xFF0B1033);
  static const navy = Color(0xFF070A1C);
  static const display = 'Anton';
  static const hand = 'Kalam';
}

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
String rupees(int n) => _rupee.format(n);

ThemeData buildTheme(Palette c) {
  final dark = c.brightness == Brightness.dark;
  final scheme = ColorScheme(
    brightness: c.brightness,
    primary: c.gold,
    onPrimary: Brand.onGold,
    secondary: c.neonGlow,
    onSecondary: dark ? Brand.navy : Colors.white,
    surface: c.ink,
    onSurface: c.cream,
    surfaceContainerHighest: c.ink2,
    outline: c.line,
    error: c.danger,
    onError: Colors.white,
  );
  final base = dark ? ThemeData.dark(useMaterial3: true) : ThemeData.light(useMaterial3: true);
  final text = base.textTheme.apply(fontFamily: 'Hind', bodyColor: c.cream, displayColor: c.cream);
  return ThemeData(
    useMaterial3: true,
    brightness: c.brightness,
    colorScheme: scheme,
    fontFamily: 'Hind',
    textTheme: text,
    scaffoldBackgroundColor: c.night,
    appBarTheme: AppBarTheme(
      backgroundColor: c.night,
      foregroundColor: c.cream,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: c.ink,
      elevation: dark ? 0 : 1.5,
      shadowColor: const Color(0x1A0B1033),
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18), side: BorderSide(color: c.line)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: c.gold,
        foregroundColor: Brand.onGold,
        minimumSize: const Size(48, 48),
        textStyle: const TextStyle(fontFamily: 'Hind', fontWeight: FontWeight.w700, fontSize: 16),
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: c.cream,
        minimumSize: const Size(48, 48),
        side: BorderSide(color: c.neonGlow, width: 1.5),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontFamily: 'Hind', fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: c.neonGlow)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: dark ? c.night : c.ink,
      labelStyle: TextStyle(color: c.muted),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.neonGlow, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.danger)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: c.danger, width: 2)),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: c.ink,
      selectedColor: c.gold,
      side: BorderSide(color: c.line),
      labelStyle: TextStyle(color: c.cream, fontFamily: 'Hind', fontWeight: FontWeight.w600),
      secondaryLabelStyle: const TextStyle(color: Brand.onGold, fontFamily: 'Hind', fontWeight: FontWeight.w700),
      checkmarkColor: Brand.onGold,
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: ButtonStyle(
        backgroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.gold : Colors.transparent),
        foregroundColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Brand.onGold : c.cream),
        side: WidgetStatePropertyAll(BorderSide(color: c.line)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
    dividerTheme: DividerThemeData(color: c.line),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: c.ink,
      indicatorColor: c.gold,
      selectedIconTheme: const IconThemeData(color: Brand.onGold),
      unselectedIconTheme: IconThemeData(color: c.muted),
      selectedLabelTextStyle: TextStyle(color: dark ? c.gold : c.cream, fontWeight: FontWeight.w800),
      unselectedLabelTextStyle: TextStyle(color: c.muted),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.ink,
      indicatorColor: c.gold,
      iconTheme: WidgetStateProperty.resolveWith((s) => IconThemeData(color: s.contains(WidgetState.selected) ? Brand.onGold : c.muted)),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: FadeForwardsPageTransitionsBuilder(),
    }),
  );
}

/// Shows an error message from the API in a snackbar.
void showError(BuildContext context, Object e) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: Brand.danger));
}

/// Page padding that keeps forms and lists at a readable width on tablets: 16 px on phones,
/// and centred in a column of at most [maxWidth] on wider screens.
EdgeInsets pagePad(BuildContext context, {double maxWidth = 760, double top = 16, double bottom = 16}) {
  final w = MediaQuery.sizeOf(context).width;
  final side = w > maxWidth + 32 ? (w - maxWidth) / 2 : 16.0;
  return EdgeInsets.fromLTRB(side, top, side, bottom);
}

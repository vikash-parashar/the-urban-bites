import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Colours from the cart's banners: night navy, LED blue, mustard gold.
class Brand {
  static const night = Color(0xFF070A1C);
  static const ink = Color(0xFF0F1433);
  static const ink2 = Color(0xFF171D45);
  static const line = Color(0xFF262D63);
  static const neon = Color(0xFF3D5CFF);
  static const neonGlow = Color(0xFF7D93FF);
  static const gold = Color(0xFFF4B43A);
  static const cream = Color(0xFFF7F0E1);
  static const muted = Color(0xFFA4ABD0);
  static const danger = Color(0xFFFF6B6B);
  static const ok = Color(0xFF4CD48A);
}

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
String rupees(int n) => _rupee.format(n);

ThemeData buildTheme() {
  const scheme = ColorScheme.dark(
    primary: Brand.gold,
    onPrimary: Brand.night,
    secondary: Brand.neonGlow,
    surface: Brand.ink,
    onSurface: Brand.cream,
    error: Brand.danger,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: Brand.night,
    appBarTheme: const AppBarTheme(backgroundColor: Brand.night, foregroundColor: Brand.cream, elevation: 0),
    cardTheme: CardThemeData(
      color: Brand.ink,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: Brand.line)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Brand.gold,
        foregroundColor: Brand.night,
        minimumSize: const Size(48, 48),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
        shape: const StadiumBorder(),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Brand.cream,
        minimumSize: const Size(48, 48),
        side: const BorderSide(color: Brand.neonGlow, width: 1.5),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w700),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Brand.night,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Brand.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Brand.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(10), borderSide: const BorderSide(color: Brand.neonGlow, width: 2)),
    ),
    chipTheme: const ChipThemeData(backgroundColor: Brand.ink, selectedColor: Brand.gold, side: BorderSide(color: Brand.line)),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: Brand.ink,
      indicatorColor: Brand.gold,
      selectedIconTheme: IconThemeData(color: Brand.night),
      unselectedIconTheme: IconThemeData(color: Brand.muted),
      selectedLabelTextStyle: TextStyle(color: Brand.gold, fontWeight: FontWeight.w800),
      unselectedLabelTextStyle: TextStyle(color: Brand.muted),
    ),
  );
}

/// The "URBAN Bites" wordmark used on app bars.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 22});
  final double size;

  @override
  Widget build(BuildContext context) {
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: 'URBAN ', style: TextStyle(fontSize: size, fontWeight: FontWeight.w900, letterSpacing: 1, color: Brand.cream)),
        TextSpan(text: 'Bites', style: TextStyle(fontSize: size, fontStyle: FontStyle.italic, fontWeight: FontWeight.w700, color: Brand.gold)),
      ]),
    );
  }
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

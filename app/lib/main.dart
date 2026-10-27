import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'shell.dart';
import 'splash.dart';

/// The Urban Bites app: the live website (theurbanbites.in) inside a native shell, so every feature
/// shipped on the website is in the app the same minute. The shell adds what a browser tab can't:
/// a home-screen app that opens straight on the orders screen for staff, sound without a first tap,
/// location and microphone permissions, UPI/WhatsApp/phone links opening their apps, the screen kept
/// awake on the staff screen, the Android back button and an offline screen.
const siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://theurbanbites.in');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Color(0xFF0A0A10),
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0A0A10),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  final prefs = await SharedPreferences.getInstance();
  // Staff who used the orders screen last time land back on it; customers land on the menu.
  final staff = prefs.getBool(lastAreaStaffKey) ?? false;
  final shell = WebShell(site: siteUrl, startOnStaff: staff, prefs: prefs);
  runApp(UrbanBitesApp(home: SplashScreen(next: shell)));
}

class UrbanBitesApp extends StatelessWidget {
  const UrbanBitesApp({super.key, required this.home});
  final Widget home;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'The Urban Bites',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0A10),
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFF6B445), brightness: Brightness.dark),
        fontFamily: 'Hind',
      ),
      home: home,
    );
  }
}

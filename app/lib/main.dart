import 'package:flutter/material.dart';

import 'api.dart';
import 'customer/menu_screen.dart';
import 'owner/owner_home.dart';
import 'splash.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Future.wait([Api.instance.load(), ThemeController.instance.load()]);
  runApp(const UrbanBitesApp());
}

/// One app, three roles. Signed-in staff (owner or admin) open the dashboard; everyone else gets the menu.
class UrbanBitesApp extends StatefulWidget {
  const UrbanBitesApp({super.key});

  @override
  State<UrbanBitesApp> createState() => _UrbanBitesAppState();
}

class _UrbanBitesAppState extends State<UrbanBitesApp> with WidgetsBindingObserver {
  final theme = ThemeController.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    theme.addListener(_onTheme);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    theme.removeListener(_onTheme);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() => theme.systemChanged();

  // Brand colours are read while widgets build, so every screen on the stack has to rebuild.
  void _onTheme() {
    setState(() {});
    void mark(Element e) {
      e.markNeedsBuild();
      e.visitChildren(mark);
    }

    (context as Element).visitChildren(mark);
  }

  @override
  Widget build(BuildContext context) {
    final p = Brand.p;
    return MaterialApp(
      title: 'The Urban Bites',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(p),
      themeAnimationDuration: const Duration(milliseconds: 350),
      home: SplashScreen(next: Api.instance.isStaff ? const OwnerHome() : const MenuScreen()),
    );
  }
}

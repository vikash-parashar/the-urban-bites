import 'package:flutter/material.dart';

import 'api.dart';
import 'customer/menu_screen.dart';
import 'owner/owner_home.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Api.instance.load();
  runApp(const UrbanBitesApp());
}

/// One app, three roles. Signed-in staff (owner or admin) open the dashboard; everyone else gets the menu.
class UrbanBitesApp extends StatelessWidget {
  const UrbanBitesApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'The Urban Bites',
      debugShowCheckedModeBanner: false,
      theme: buildTheme(),
      home: Api.instance.isStaff ? const OwnerHome() : const MenuScreen(),
    );
  }
}

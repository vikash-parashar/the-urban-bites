import 'package:flutter/material.dart';

import '../api.dart';
import '../customer/menu_screen.dart';
import '../brand_widgets.dart';
import '../theme.dart';
import 'earnings_screen.dart';
import 'menu_editor_screen.dart';
import 'offers_screen.dart';
import 'orders_screen.dart';
import 'shop_screen.dart';
import 'staff_screen.dart';
import 'walkin_screen.dart';

/// The staff dashboard. Side rail on the tablet, bottom bar on a phone.
/// The Staff tab appears only for the admin.
class OwnerHome extends StatefulWidget {
  const OwnerHome({super.key});

  @override
  State<OwnerHome> createState() => _OwnerHomeState();
}

class _OwnerHomeState extends State<OwnerHome> {
  int tab = 0;

  Future<void> _signOut() async {
    await Api.instance.signOut();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder: (_) => const MenuScreen()), (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final admin = Api.instance.isAdmin;
    final staff = Api.instance.staff;
    final pages = <Widget>[
      const OrdersScreen(),
      const WalkInScreen(),
      const OffersScreen(),
      const MenuEditorScreen(),
      const ShopScreen(),
      const EarningsScreen(),
      if (admin) const StaffScreen(),
    ];
    final dests = <(IconData, String)>[
      (Icons.receipt_long, 'Orders'),
      (Icons.point_of_sale, 'Walk-in'),
      (Icons.local_offer, 'Offers'),
      (Icons.restaurant_menu, 'Menu'),
      (Icons.storefront, 'Shop'),
      (Icons.payments, 'Earnings'),
      if (admin) (Icons.group, 'Staff'),
    ];
    final wide = MediaQuery.sizeOf(context).width >= 720;

    final appBar = AppBar(
      title: const Wordmark(size: 20),
      actions: [
        const ThemeToggle(),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Center(
            child: Text('${staff?.name ?? ''} · ${admin ? 'Admin' : 'Owner'}', style: TextStyle(color: Brand.muted)),
          ),
        ),
        IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: _signOut),
      ],
    );

    if (wide) {
      return Scaffold(
        appBar: appBar,
        body: Row(children: [
          NavigationRail(
            selectedIndex: tab,
            onDestinationSelected: (i) => setState(() => tab = i),
            labelType: NavigationRailLabelType.all,
            destinations: [for (final (icon, label) in dests) NavigationRailDestination(icon: Icon(icon), label: Text(label))],
          ),
          Expanded(child: IndexedStack(index: tab, children: pages)),
        ]),
      );
    }
    return Scaffold(
      appBar: appBar,
      body: IndexedStack(index: tab, children: pages),
      bottomNavigationBar: NavigationBar(
        labelBehavior: NavigationDestinationLabelBehavior.onlyShowSelected,
        selectedIndex: tab,
        onDestinationSelected: (i) => setState(() => tab = i),
        backgroundColor: Brand.ink,
        indicatorColor: Brand.gold,
        destinations: [for (final (icon, label) in dests) NavigationDestination(icon: Icon(icon), label: label)],
      ),
    );
  }
}

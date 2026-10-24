import 'package:flutter/material.dart';

import '../api.dart';
import '../demo.dart';
import '../models.dart';
import '../owner/login_screen.dart';
import '../theme.dart';
import 'cart.dart';
import 'checkout_screen.dart';
import 'track_screen.dart';

/// Dish photos are served by the website, so the app and the site always show the same pictures.
const siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://theurbanbites.in');

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  late Future<List<Category>> _menu = Api.instance.menu();
  final cart = Cart.instance;
  List<Offer> offers = [];
  Shop shop = Shop.fallback;

  @override
  void initState() {
    super.initState();
    cart.addListener(_onCart);
    Api.instance.offers().then((o) {
      if (mounted) setState(() => offers = o);
    }).catchError((_) {});
    Api.instance.shop().then((s) {
      if (mounted) setState(() => shop = s);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    cart.removeListener(_onCart);
    super.dispose();
  }

  void _onCart() => setState(() {});

  Future<void> _openTracking() async {
    final orders = await Api.instance.myOrders();
    if (!mounted) return;
    if (orders.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No orders on this phone yet.')));
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => TrackScreen(order: orders.first)));
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Category>>(
      future: _menu,
      builder: (context, snap) {
        if (snap.hasError) {
          return Scaffold(
            appBar: AppBar(title: const Wordmark()),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Text(snap.error.toString(), textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => setState(() => _menu = Api.instance.menu()), child: const Text('Try again')),
                ]),
              ),
            ),
          );
        }
        if (!snap.hasData) {
          return Scaffold(appBar: AppBar(title: const Wordmark()), body: const Center(child: CircularProgressIndicator()));
        }
        final cats = snap.data!;
        return DefaultTabController(
          length: cats.length,
          child: Scaffold(
            appBar: AppBar(
              title: const Wordmark(),
              actions: [
                IconButton(tooltip: 'Track my order', icon: const Icon(Icons.receipt_long), onPressed: _openTracking),
                TextButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen())),
                  child: const Text('Staff sign in', style: TextStyle(color: Brand.muted)),
                ),
              ],
              bottom: TabBar(
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                indicatorColor: Brand.gold,
                labelColor: Brand.gold,
                unselectedLabelColor: Brand.muted,
                tabs: [for (final c in cats) Tab(text: c.name)],
              ),
            ),
            body: Column(children: [
              _DealStrip(offers: offers, shop: shop),
              Expanded(child: TabBarView(children: [for (final c in cats) _CategoryGrid(category: c)])),
            ]),
            bottomNavigationBar: cart.count == 0
                ? null
                : SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                      child: FilledButton(
                        onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CheckoutScreen())),
                        child: Text('${cart.count} ${cart.count == 1 ? 'item' : 'items'} · ${rupees(cart.total)} · View order'),
                      ),
                    ),
                  ),
          ),
        );
      },
    );
  }
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.category});
  final Category category;

  @override
  Widget build(BuildContext context) {
    // Tile height = photo (16:10 of the tile width) + a fixed text block, so cards don't grow
    // empty space on tablets the way a fixed aspect ratio does.
    return LayoutBuilder(builder: (context, box) {
      const gap = 14.0, maxTile = 320.0;
      final inner = box.maxWidth - 32;
      final cols = ((inner + gap) / (maxTile + gap)).ceil().clamp(1, 6);
      final tileW = (inner - gap * (cols - 1)) / cols;
      final hasHalf = category.items.any((i) => i.half != null);
      return GridView.builder(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: cols,
          mainAxisSpacing: gap,
          crossAxisSpacing: gap,
          mainAxisExtent: tileW * 10 / 16 + (hasHalf ? 178 : 132),
        ),
        itemCount: category.items.length,
        itemBuilder: (_, i) => DishCard(item: category.items[i]),
      );
    });
  }
}

class DishCard extends StatefulWidget {
  const DishCard({super.key, required this.item});
  final MenuItem item;

  @override
  State<DishCard> createState() => _DishCardState();
}

class _DishCardState extends State<DishCard> {
  String size = 'full';

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final cart = Cart.instance;
    final price = item.price(size);
    final qty = cart.qtyOf(item.id, size);

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        AspectRatio(aspectRatio: 16 / 10, child: _DishImage(item: item)),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(item.nameHi, style: const TextStyle(color: Brand.gold, fontSize: 13)),
              Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              if (item.half != null) ...[
                const SizedBox(height: 6),
                SegmentedButton<String>(
                  showSelectedIcon: false,
                  style: const ButtonStyle(visualDensity: VisualDensity.compact),
                  segments: [
                    ButtonSegment(value: 'full', label: Text('Full ${rupees(item.full ?? 0)}')),
                    ButtonSegment(value: 'half', label: Text('Half ${rupees(item.half!)}')),
                  ],
                  selected: {size},
                  onSelectionChanged: (s) => setState(() => size = s.first),
                ),
              ],
              const Spacer(),
              Row(children: [
                Expanded(
                  child: price == null
                      ? const Text('Price at the counter', style: TextStyle(color: Brand.muted))
                      : Text.rich(TextSpan(children: [
                          if (size == 'full' && item.offerPrice != null && item.full != null)
                            TextSpan(
                              text: '${rupees(item.full!)} ',
                              style: const TextStyle(color: Brand.muted, fontSize: 14, decoration: TextDecoration.lineThrough),
                            ),
                          TextSpan(text: rupees(price), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
                        ])),
                ),
                if (price != null)
                  qty == 0
                      ? FilledButton(onPressed: () => cart.add(item, size), child: const Text('Add'))
                      : _Stepper(qty: qty, onMinus: () => cart.remove(item, size), onPlus: () => cart.add(item, size)),
              ]),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _DishImage extends StatelessWidget {
  const _DishImage({required this.item});
  final MenuItem item;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      alignment: Alignment.center,
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(gradient: LinearGradient(colors: [Brand.ink2, Brand.night])),
      child: Text(
        item.name.replaceAll(RegExp(r'\s+\d.*$'), '').toUpperCase(),
        textAlign: TextAlign.center,
        style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Brand.cream, shadows: [Shadow(color: Brand.neon, blurRadius: 16)]),
      ),
    );
    if (item.image.isEmpty) return fallback;
    if (demoMode) return Image.asset('assets/dishes/${item.image}.jpg', fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback);
    return Image.network('$siteUrl/media/dishes/${item.image}.jpg', fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback);
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({required this.qty, required this.onMinus, required this.onPlus});
  final int qty;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const ShapeDecoration(color: Brand.gold, shape: StadiumBorder()),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(visualDensity: VisualDensity.compact, color: Brand.night, onPressed: onMinus, icon: const Icon(Icons.remove), tooltip: 'Remove one'),
        Text('$qty', style: const TextStyle(color: Brand.night, fontWeight: FontWeight.w900)),
        IconButton(visualDensity: VisualDensity.compact, color: Brand.night, onPressed: onPlus, icon: const Icon(Icons.add), tooltip: 'Add one'),
      ]),
    );
  }
}

/// Free delivery rule and today's offers, above the menu.
class _DealStrip extends StatelessWidget {
  const _DealStrip({required this.offers, required this.shop});
  final List<Offer> offers;
  final Shop shop;

  @override
  Widget build(BuildContext context) {
    final cards = <Widget>[
      if (!shop.acceptingOrders) _deal('ORDERS PAUSED', shop.notice.isNotEmpty ? shop.notice : 'Call 83989 07216 or visit the cart', Brand.danger),
      _deal('FREE DELIVERY', 'Within ${shop.freeDeliveryKm.toStringAsFixed(0)} km on orders above ${rupees(shop.freeDeliveryMin)}', Brand.gold),
      for (final o in offers) _deal(o.period == 'day' ? 'OFFER OF THE DAY' : 'OFFER OF THE MONTH', o.title, o.period == 'day' ? Brand.gold : Brand.neonGlow),
    ];
    return SizedBox(
      height: 86,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        itemCount: cards.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (_, i) => cards[i],
      ),
    );
  }

  Widget _deal(String label, String text, Color c) => Container(
        width: 260,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: Brand.ink, borderRadius: BorderRadius.circular(14), border: Border.all(color: c, width: 1.5)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Text(label, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
          const SizedBox(height: 2),
          Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700)),
        ]),
      );
}

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../api.dart';
import '../brand_widgets.dart';
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
  String query = '';
  bool searching = false;
  final _search = TextEditingController();

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
    _search.dispose();
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

  void _toggleSearch() {
    setState(() {
      searching = !searching;
      if (!searching) {
        query = '';
        _search.clear();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Category>>(
      future: _menu,
      builder: (context, snap) {
        if (snap.hasError) {
          return Scaffold(
            appBar: AppBar(title: const Wordmark(), actions: const [ThemeToggle()]),
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Text('🥟', style: TextStyle(fontSize: 56)),
                  const SizedBox(height: 12),
                  Text("Couldn't load the menu. Check your internet and try again.", textAlign: TextAlign.center, style: TextStyle(color: Brand.muted)),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: () => setState(() => _menu = Api.instance.menu()), child: const Text('Try again')),
                ]),
              ),
            ),
          );
        }
        if (!snap.hasData) return const _MenuLoading();
        final cats = snap.data!;
        return DefaultTabController(
          length: cats.length,
          child: Scaffold(
            body: NestedScrollView(
              headerSliverBuilder: (context, _) => [
                SliverOverlapAbsorber(
                  handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
                  sliver: SliverMainAxisGroup(slivers: [
                    _HeroAppBar(
                      shop: shop,
                      searching: searching,
                      search: _search,
                      onQuery: (q) => setState(() => query = q.trim().toLowerCase()),
                      onSearch: _toggleSearch,
                      onTrack: _openTracking,
                    ),
                    SliverToBoxAdapter(child: _DealCarousel(offers: offers, shop: shop)),
                    if (query.isEmpty)
                      SliverPersistentHeader(pinned: true, delegate: _TabsHeader(cats)),
                  ]),
                ),
              ],
              body: query.isNotEmpty
                  ? _SearchResults(cats: cats, query: query)
                  : TabBarView(children: [for (final c in cats) _CategoryGrid(category: c)]),
            ),
            bottomNavigationBar: _CartBar(cart: cart),
          ),
        );
      },
    );
  }
}

/// A big photo header with the logo, open/closed status and quick actions. Collapses to a slim bar.
class _HeroAppBar extends StatelessWidget {
  const _HeroAppBar({
    required this.shop,
    required this.searching,
    required this.search,
    required this.onQuery,
    required this.onSearch,
    required this.onTrack,
  });
  final Shop shop;
  final bool searching;
  final TextEditingController search;
  final ValueChanged<String> onQuery;
  final VoidCallback onSearch;
  final VoidCallback onTrack;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return SliverAppBar(
      pinned: true,
      expandedHeight: 300,
      // The header stays navy in day mode too, like the cart's signboard.
      backgroundColor: Brand.navy,
      foregroundColor: Palette.dark.cream,
      iconTheme: IconThemeData(color: Palette.dark.cream),
      actionsIconTheme: IconThemeData(color: Palette.dark.cream),
      titleSpacing: 12,
      title: searching
          ? TextField(
              controller: search,
              autofocus: true,
              style: TextStyle(color: Palette.dark.cream),
              onChanged: onQuery,
              textInputAction: TextInputAction.search,
              decoration: InputDecoration(
                hintText: 'Search momos, chaap, chai…',
                prefixIcon: const Icon(Icons.search),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 8),
                fillColor: Palette.dark.ink,
                hintStyle: TextStyle(color: Palette.dark.muted),
                prefixIconColor: Palette.dark.muted,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(30), borderSide: BorderSide.none),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(30), borderSide: BorderSide(color: Palette.dark.line)),
              ),
            )
          : const Wordmark(size: 20, onDark: true),
      actions: [
        IconButton(tooltip: searching ? 'Close search' : 'Search the menu', icon: Icon(searching ? Icons.close : Icons.search), onPressed: onSearch),
        if (!searching) ...[
          const ThemeToggle(color: Color(0xFFF4B43A)),
          IconButton(tooltip: 'Track my order', icon: const Icon(Icons.receipt_long_rounded), onPressed: onTrack),
          PopupMenuButton<String>(
            tooltip: 'More',
            onSelected: (v) {
              if (v == 'staff') Navigator.of(context).push(MaterialPageRoute(builder: (_) => const LoginScreen()));
            },
            itemBuilder: (_) => const [PopupMenuItem(value: 'staff', child: ListTile(leading: Icon(Icons.storefront), title: Text('Staff sign in')))],
          ),
        ],
      ],
      flexibleSpace: LayoutBuilder(builder: (context, box) {
        final t = ((box.maxHeight - kToolbarHeight - top) / (300 - kToolbarHeight)).clamp(0.0, 1.0);
        return Stack(fit: StackFit.expand, children: [
          Opacity(opacity: t, child: const _KenBurns(image: 'assets/hero/night-huts-2.jpg')),
          Opacity(
            opacity: t,
            child: const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xAA070A1C), Color(0x22070A1C), Color(0xF2070A1C)],
                  stops: [0, 0.4, 1],
                ),
              ),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 14,
            child: Opacity(
              opacity: t,
              child: Transform.translate(
                offset: Offset(0, 20 * (1 - t)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  _OpenPill(open: shop.acceptingOrders),
                  const SizedBox(height: 8),
                  const Text(
                    'Hot momos.\nSizzling chaap.',
                    style: TextStyle(
                      fontFamily: Brand.display,
                      fontSize: 34,
                      height: 1.05,
                      color: Color(0xFFF7F0E1),
                      shadows: [Shadow(color: Color(0xAA000000), blurRadius: 12)],
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '100% veg · Fresh off the tawa · Julana Bypass',
                    style: TextStyle(color: const Color(0xFFF7F0E1).withValues(alpha: 0.85), fontWeight: FontWeight.w600),
                  ),
                ]),
              ),
            ),
          ),
        ]);
      }),
    );
  }
}

class _OpenPill extends StatelessWidget {
  const _OpenPill({required this.open});
  final bool open;

  @override
  Widget build(BuildContext context) {
    final c = open ? Brand.ok : Brand.danger;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: const Color(0xCC070A1C), borderRadius: BorderRadius.circular(30), border: Border.all(color: c)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        _Pulse(color: c),
        const SizedBox(width: 6),
        Text(open ? 'Taking orders now' : 'Orders paused', style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 12)),
      ]),
    );
  }
}

/// A dot that pulses, for "live" status.
class _Pulse extends StatefulWidget {
  const _Pulse({required this.color});
  final Color color;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: widget.color,
          shape: BoxShape.circle,
          boxShadow: [BoxShadow(color: widget.color.withValues(alpha: 1 - _c.value), blurRadius: 0, spreadRadius: 6 * _c.value)],
        ),
      ),
    );
  }
}

/// Slow zoom and drift over the hero photo.
class _KenBurns extends StatefulWidget {
  const _KenBurns({required this.image});
  final String image;

  @override
  State<_KenBurns> createState() => _KenBurnsState();
}

class _KenBurnsState extends State<_KenBurns> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 18))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final img = Image.asset(widget.image, fit: BoxFit.cover, alignment: const Alignment(0, -0.2));
    if (MediaQuery.of(context).disableAnimations) return img;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final v = Curves.easeInOut.transform(_c.value);
        return Transform.scale(scale: 1.08 + 0.1 * v, alignment: Alignment(-0.3 + 0.6 * v, 0), child: child);
      },
      child: img,
    );
  }
}

/// Category tabs with an icon each. Stays pinned under the app bar.
class _TabsHeader extends SliverPersistentHeaderDelegate {
  _TabsHeader(this.cats);
  final List<Category> cats;

  @override
  double get minExtent => 56;
  @override
  double get maxExtent => 56;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return Container(
      color: Brand.night,
      alignment: Alignment.centerLeft,
      child: TabBar(
        isScrollable: true,
        tabAlignment: TabAlignment.start,
        dividerColor: Colors.transparent,
        indicatorSize: TabBarIndicatorSize.tab,
        indicatorPadding: const EdgeInsets.symmetric(vertical: 8),
        indicator: BoxDecoration(color: Brand.gold, borderRadius: BorderRadius.circular(30)),
        labelColor: Brand.onGold,
        unselectedLabelColor: Brand.cream,
        labelStyle: const TextStyle(fontWeight: FontWeight.w700, fontFamily: 'Hind', fontSize: 14),
        padding: const EdgeInsets.symmetric(horizontal: 8),
        splashBorderRadius: BorderRadius.circular(30),
        tabs: [
          for (final c in cats)
            Tab(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(categoryEmoji(c), style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 6),
                  Text(c.name),
                ]),
              ),
            ),
        ],
      ),
    );
  }

  @override
  bool shouldRebuild(_TabsHeader old) => true;
}

/// Free delivery rule and offers, sliding past on their own.
class _DealCarousel extends StatefulWidget {
  const _DealCarousel({required this.offers, required this.shop});
  final List<Offer> offers;
  final Shop shop;

  @override
  State<_DealCarousel> createState() => _DealCarouselState();
}

class _DealCarouselState extends State<_DealCarousel> {
  PageController _pc = PageController(viewportFraction: 0.88);
  Timer? _timer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // About 340 px per card: one and a bit on a phone, three or four on a tablet.
    final f = (340 / MediaQuery.sizeOf(context).width).clamp(0.25, 0.88);
    if ((f - _pc.viewportFraction).abs() > 0.01) {
      final old = _pc;
      _pc = PageController(viewportFraction: f, initialPage: page);
      WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
    }
  }
  int page = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) {
      final n = _cards().length;
      if (n < 2 || !_pc.hasClients) return;
      _pc.animateToPage((page + 1) % n, duration: const Duration(milliseconds: 600), curve: Curves.easeOutCubic);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pc.dispose();
    super.dispose();
  }

  List<(String, String, String, Color)> _cards() {
    final s = widget.shop;
    return [
      if (!s.acceptingOrders) ('⏸️', 'ORDERS PAUSED', s.notice.isNotEmpty ? s.notice : 'Call 83989 07216 or visit the cart', Brand.danger),
      for (final o in widget.offers)
        (o.period == 'day' ? '🔥' : '🎉', o.period == 'day' ? 'OFFER OF THE DAY' : 'OFFER OF THE MONTH', o.title, o.period == 'day' ? Brand.gold : Brand.neonGlow),
      ('🛵', 'FREE DELIVERY', 'Within ${s.freeDeliveryKm.toStringAsFixed(0)} km on orders above ${rupees(s.freeDeliveryMin)}', Brand.ok),
      if (s.hasUpi) ('📲', 'PAY BY UPI', 'GPay, PhonePe or Paytm after you order', Brand.neonGlow),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final cards = _cards();
    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 4),
      child: Column(children: [
        SizedBox(
          height: 84,
          child: PageView.builder(
            controller: _pc,
            padEnds: false,
            itemCount: cards.length,
            onPageChanged: (i) => setState(() => page = i),
            itemBuilder: (_, i) {
              final (emoji, label, text, c) = cards[i];
              return Padding(
                padding: EdgeInsets.only(left: i == 0 ? 16 : 6, right: 6),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(18),
                    gradient: LinearGradient(colors: [c.withValues(alpha: 0.22), Brand.ink]),
                    border: Border.all(color: c.withValues(alpha: 0.8), width: 1.3),
                  ),
                  child: Row(children: [
                    Text(emoji, style: const TextStyle(fontSize: 30)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                        Text(label, style: TextStyle(color: c, fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 1.4)),
                        Text(text, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.2)),
                      ]),
                    ),
                  ]),
                ),
              );
            },
          ),
        ),
        if (cards.length > 1)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              for (var i = 0; i < cards.length; i++)
                AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  width: i == page ? 18 : 6,
                  height: 6,
                  decoration: BoxDecoration(color: i == page ? Brand.gold : Brand.line, borderRadius: BorderRadius.circular(3)),
                ),
            ]),
          ),
      ]),
    );
  }
}

/// Grid sizing shared by the category tabs and search results. Tile height is the photo
/// (16:10 of the tile width) plus a fixed text block, so cards don't grow empty space on tablets.
SliverGridDelegate _gridFor(double width, bool hasHalf) {
  const gap = 14.0, maxTile = 320.0;
  final inner = width - 32;
  final cols = ((inner + gap) / (maxTile + gap)).ceil().clamp(1, 6);
  final tileW = (inner - gap * (cols - 1)) / cols;
  return SliverGridDelegateWithFixedCrossAxisCount(
    crossAxisCount: cols,
    mainAxisSpacing: gap,
    crossAxisSpacing: gap,
    mainAxisExtent: tileW * 10 / 16 + (hasHalf ? 196 : 150),
  );
}

class _CategoryGrid extends StatelessWidget {
  const _CategoryGrid({required this.category});
  final Category category;

  @override
  Widget build(BuildContext context) {
    final hasHalf = category.items.any((i) => i.half != null);
    return LayoutBuilder(builder: (context, box) {
      return CustomScrollView(
        key: PageStorageKey(category.id),
        slivers: [
          SliverOverlapInjector(handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context)),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
              child: Row(children: [
                Text(categoryEmoji(category), style: const TextStyle(fontSize: 26)),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(category.name.toUpperCase(), style: TextStyle(fontFamily: Brand.display, fontSize: 22, letterSpacing: 1, color: Brand.cream)),
                    if (category.nameHi.isNotEmpty) Text(category.nameHi, style: TextStyle(color: Brand.gold, fontSize: 13)),
                  ]),
                ),
                Text('${category.items.length} items', style: TextStyle(color: Brand.muted, fontSize: 12)),
              ]),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 100),
            sliver: SliverGrid.builder(
              gridDelegate: _gridFor(box.maxWidth, hasHalf),
              itemCount: category.items.length,
              itemBuilder: (_, i) => Entrance(index: i, child: DishCard(item: category.items[i], category: category.name)),
            ),
          ),
        ],
      );
    });
  }
}

class _SearchResults extends StatelessWidget {
  const _SearchResults({required this.cats, required this.query});
  final List<Category> cats;
  final String query;

  @override
  Widget build(BuildContext context) {
    final hits = <(MenuItem, String)>[
      for (final c in cats)
        for (final i in c.items)
          if (i.name.toLowerCase().contains(query) || i.nameHi.contains(query) || c.name.toLowerCase().contains(query)) (i, c.name),
    ];
    return LayoutBuilder(builder: (context, box) {
      return CustomScrollView(slivers: [
        SliverOverlapInjector(handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context)),
        if (hits.isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('🤔', style: TextStyle(fontSize: 48)),
                const SizedBox(height: 8),
                Text('Nothing called "$query" on the menu.', style: TextStyle(color: Brand.muted)),
              ]),
            ),
          )
        else
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 100),
            sliver: SliverGrid.builder(
              gridDelegate: _gridFor(box.maxWidth, hits.any((h) => h.$1.half != null)),
              itemCount: hits.length,
              itemBuilder: (_, i) => Entrance(index: i, child: DishCard(item: hits[i].$1, category: hits[i].$2)),
            ),
          ),
      ]);
    });
  }
}

class DishCard extends StatefulWidget {
  const DishCard({super.key, required this.item, this.category = ''});
  final MenuItem item;
  final String category;

  @override
  State<DishCard> createState() => _DishCardState();
}

class _DishCardState extends State<DishCard> {
  String size = 'full';
  bool pressed = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final cart = Cart.instance;
    final price = item.price(size);
    final qty = cart.qtyOf(item.id, size);
    final kind = itemKind(item.name, widget.category);
    final onOffer = item.offerPrice != null && item.full != null && item.offerPrice! < item.full!;

    return AnimatedScale(
      scale: pressed ? 0.97 : 1,
      duration: const Duration(milliseconds: 120),
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onHighlightChanged: (v) => setState(() => pressed = v),
          onTap: price == null ? null : () {
            HapticFeedback.selectionClick();
            cart.add(item, size);
          },
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(fit: StackFit.expand, children: [
                _DishImage(item: item, kind: kind),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [Color(0x00000000), Color(0x99000000)], stops: [0.55, 1]),
                  ),
                ),
                Positioned(left: 10, bottom: 8, child: ItemBadge(kind: kind)),
                if (onOffer)
                  Positioned(
                    top: 10,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(10, 4, 8, 4),
                      decoration: const BoxDecoration(color: Color(0xFFE53935), borderRadius: BorderRadius.horizontal(left: Radius.circular(20))),
                      child: Text('${rupees(item.full! - item.offerPrice!)} OFF', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
                    ),
                  ),
                if (!item.available)
                  Container(
                    color: const Color(0xAA000000),
                    alignment: Alignment.center,
                    child: const Text('SOLD OUT', style: TextStyle(fontFamily: Brand.display, color: Colors.white, fontSize: 22, letterSpacing: 2)),
                  ),
              ]),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    KindTag(kind: kind),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(item.nameHi, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: Brand.gold, fontSize: 13)),
                    ),
                  ]),
                  const SizedBox(height: 4),
                  Text(item.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16, height: 1.2)),
                  if (item.half != null) ...[
                    const SizedBox(height: 8),
                    SizedBox(
                      width: double.infinity,
                      child: SegmentedButton<String>(
                        showSelectedIcon: false,
                        style: const ButtonStyle(visualDensity: VisualDensity.compact),
                        segments: [
                          ButtonSegment(value: 'full', label: Text('Full ${rupees(item.full ?? 0)}')),
                          ButtonSegment(value: 'half', label: Text('Half ${rupees(item.half!)}')),
                        ],
                        selected: {size},
                        onSelectionChanged: (s) => setState(() => size = s.first),
                      ),
                    ),
                  ],
                  const Spacer(),
                  Row(children: [
                    Expanded(
                      child: price == null
                          ? Text('Price at the counter', style: TextStyle(color: Brand.muted))
                          : Text.rich(TextSpan(children: [
                              if (size == 'full' && onOffer)
                                TextSpan(
                                  text: '${rupees(item.full!)} ',
                                  style: TextStyle(color: Brand.muted, fontSize: 14, decoration: TextDecoration.lineThrough),
                                ),
                              TextSpan(text: rupees(price), style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w700)),
                            ])),
                    ),
                    if (price != null && item.available)
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 250),
                        transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                        child: qty == 0
                            ? FilledButton.icon(
                                key: const ValueKey('add'),
                                onPressed: () {
                                  HapticFeedback.lightImpact();
                                  cart.add(item, size);
                                },
                                icon: const Icon(Icons.add_rounded, size: 18),
                                label: const Text('Add'),
                              )
                            : _Stepper(
                                key: const ValueKey('step'),
                                qty: qty,
                                onMinus: () => cart.remove(item, size),
                                onPlus: () {
                                  HapticFeedback.selectionClick();
                                  cart.add(item, size);
                                },
                              ),
                      ),
                  ]),
                ]),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _DishImage extends StatelessWidget {
  const _DishImage({required this.item, required this.kind});
  final MenuItem item;
  final ItemKind kind;

  @override
  Widget build(BuildContext context) {
    // No photo: a glowing tile with the item's icon, so packaged snacks and drinks still look good.
    final fallback = Container(
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: kind.drink ? [const Color(0xFF1B2A8C), const Color(0xFF070A1C)] : [const Color(0xFF5A2A07), const Color(0xFF140A1C)],
        ),
      ),
      child: Stack(alignment: Alignment.center, children: [
        Positioned(
          right: -18,
          top: -18,
          child: Transform.rotate(
            angle: -math.pi / 10,
            child: Text(kind.emoji, style: TextStyle(fontSize: 110, color: Colors.white.withValues(alpha: 0.12))),
          ),
        ),
        Text(kind.emoji, style: const TextStyle(fontSize: 54, shadows: [Shadow(color: Color(0xFF3D5CFF), blurRadius: 24)])),
      ]),
    );
    if (item.image.isEmpty) return fallback;
    if (demoMode) return Image.asset('assets/dishes/${item.image}.jpg', fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback);
    return Image.network(
      '$siteUrl/media/dishes/${item.image}.jpg',
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => fallback,
      frameBuilder: (_, child, frame, sync) => sync
          ? child
          : AnimatedOpacity(opacity: frame == null ? 0 : 1, duration: const Duration(milliseconds: 400), child: child),
    );
  }
}

class _Stepper extends StatelessWidget {
  const _Stepper({super.key, required this.qty, required this.onMinus, required this.onPlus});
  final int qty;
  final VoidCallback onMinus;
  final VoidCallback onPlus;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: ShapeDecoration(color: Brand.gold, shape: const StadiumBorder()),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(visualDensity: VisualDensity.compact, color: Brand.onGold, onPressed: onMinus, icon: const Icon(Icons.remove_rounded), tooltip: 'Remove one'),
        Bump(trigger: qty, child: Text('$qty', style: const TextStyle(color: Brand.onGold, fontWeight: FontWeight.w700, fontSize: 16))),
        IconButton(visualDensity: VisualDensity.compact, color: Brand.onGold, onPressed: onPlus, icon: const Icon(Icons.add_rounded), tooltip: 'Add one'),
      ]),
    );
  }
}

/// The bar at the bottom that slides up once something is in the cart.
class _CartBar extends StatelessWidget {
  const _CartBar({required this.cart});
  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final show = cart.count > 0;
    return AnimatedSize(
      duration: const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
      child: !show
          ? const SizedBox(width: double.infinity)
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: Material(
                  color: Brand.gold,
                  shape: const StadiumBorder(),
                  elevation: 8,
                  shadowColor: Brand.gold.withValues(alpha: 0.5),
                  child: InkWell(
                    customBorder: const StadiumBorder(),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const CheckoutScreen())),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                      child: Row(children: [
                        Bump(
                          trigger: cart.count,
                          child: Container(
                            width: 40,
                            height: 40,
                            alignment: Alignment.center,
                            decoration: const BoxDecoration(color: Brand.onGold, shape: BoxShape.circle),
                            child: Text('${cart.count}', style: const TextStyle(color: Color(0xFFF4B43A), fontWeight: FontWeight.w700, fontSize: 16)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                            Text(cart.count == 1 ? '1 item' : '${cart.count} items', style: const TextStyle(color: Brand.onGold, fontSize: 12, fontWeight: FontWeight.w600)),
                            Text(rupees(cart.total), style: const TextStyle(color: Brand.onGold, fontSize: 18, fontWeight: FontWeight.w700, height: 1.1)),
                          ]),
                        ),
                        const Text('View order', style: TextStyle(color: Brand.onGold, fontWeight: FontWeight.w700, fontSize: 16)),
                        const SizedBox(width: 4),
                        const Icon(Icons.arrow_forward_rounded, color: Brand.onGold),
                        const SizedBox(width: 8),
                      ]),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}

/// Shimmering placeholder cards while the menu loads.
class _MenuLoading extends StatefulWidget {
  const _MenuLoading();

  @override
  State<_MenuLoading> createState() => _MenuLoadingState();
}

class _MenuLoadingState extends State<_MenuLoading> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Wordmark(size: 20, onDark: true), actions: const [ThemeToggle()]),
      body: AnimatedBuilder(
        animation: _c,
        builder: (_, __) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (var i = 0; i < 4; i++)
              Container(
                height: 220,
                margin: const EdgeInsets.only(bottom: 14),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: LinearGradient(
                    begin: Alignment(-1 + 3 * _c.value - 1, 0),
                    end: Alignment(1 + 3 * _c.value - 1, 0),
                    colors: [Brand.ink, Brand.ink2, Brand.ink],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

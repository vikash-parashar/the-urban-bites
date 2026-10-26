import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'models.dart';
import 'theme.dart';

/// The app logo: the tikka skewer icon (charcoal tile, flames over a skewer).
class LogoMark extends StatelessWidget {
  const LogoMark({super.key, this.size = 40});
  final double size;

  @override
  Widget build(BuildContext context) => Image.asset('assets/mark-512.png', width: size, height: size, filterQuality: FilterQuality.medium);
}

/// Logo plus "The Urban Bites", used in app bars.
class Wordmark extends StatelessWidget {
  const Wordmark({super.key, this.size = 22, this.showMark = true, this.onDark = false});
  final double size;
  final bool showMark;
  /// Always use the night colours, for wordmarks on photos or navy.
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final p = onDark ? Palette.dark : Brand.p;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      if (showMark) ...[LogoMark(size: size * 1.55), SizedBox(width: size * 0.45)],
      Flexible(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('THE', style: TextStyle(fontFamily: Brand.display, fontSize: size * 0.42, letterSpacing: 3, color: p.muted, height: 1)),
          Text.rich(
            TextSpan(children: [
              TextSpan(text: 'URBAN ', style: TextStyle(fontFamily: Brand.display, fontSize: size, letterSpacing: 1, color: p.cream, height: 1.05)),
              TextSpan(text: 'BITES', style: TextStyle(fontFamily: Brand.display, fontSize: size, letterSpacing: 1, color: p == Palette.dark ? const Color(0xFFFF7A1A) : const Color(0xFFB8430F), height: 1.05)),
            ]),
            maxLines: 1,
            overflow: TextOverflow.fade,
            softWrap: false,
          ),
        ]),
      ),
    ]);
  }
}

/// Sun / moon button that flips day and night mode.
class ThemeToggle extends StatelessWidget {
  const ThemeToggle({super.key, this.color});
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final dark = ThemeController.instance.isDark;
    return IconButton(
      tooltip: dark ? 'Switch to day mode' : 'Switch to night mode',
      onPressed: ThemeController.instance.toggle,
      icon: AnimatedSwitcher(
        duration: const Duration(milliseconds: 380),
        transitionBuilder: (child, a) => RotationTransition(
          turns: Tween(begin: 0.6, end: 1.0).animate(a),
          child: ScaleTransition(scale: a, child: child),
        ),
        child: Icon(
          dark ? Icons.dark_mode_rounded : Icons.light_mode_rounded,
          key: ValueKey(dark),
          color: color ?? (dark ? Brand.neonGlow : Brand.gold),
        ),
      ),
    );
  }
}

/// What kind of thing a menu item is, for its icon.
class ItemKind {
  const ItemKind(this.emoji, this.drink);
  final String emoji;
  final bool drink;
}

/// Picks an icon for a menu item from its name and category. Drinks get a drink icon, food a food icon.
ItemKind itemKind(String name, [String category = '']) {
  final n = name.toLowerCase();
  final c = category.toLowerCase();
  bool has(List<String> w) => w.any(n.contains);
  if (has(['chai', 'tea'])) return const ItemKind('☕', true);
  if (has(['coffee'])) return const ItemKind('🧋', true);
  if (has(['lassi', 'shake'])) return const ItemKind('🥛', true);
  if (has(['water'])) return const ItemKind('💧', true);
  if (has(['red bull'])) return const ItemKind('⚡', true);
  if (has(['maaza', 'mango'])) return const ItemKind('🥭', true);
  if (has(['pepsi', 'cola', 'thums', 'sprite', 'cold drink', 'soda'])) return const ItemKind('🥤', true);
  if (has(['raita', 'dahi', 'curd'])) return const ItemKind('🥣', false);
  if (has(['momo'])) return const ItemKind('🥟', false);
  if (has(['chaap'])) return const ItemKind('🍢', false);
  if (has(['tikka'])) return const ItemKind('🍢', false);
  if (has(['fried rice', 'rice'])) return const ItemKind('🍚', false);
  if (has(['manchurian', 'chilli paneer', 'paneer chilli', 'noodle', 'chowmein'])) return const ItemKind('🥡', false);
  if (has(['mushroom'])) return const ItemKind('🍄', false);
  if (has(['paneer'])) return has(['paratha']) ? const ItemKind('🫓', false) : const ItemKind('🧀', false);
  if (has(['naan', 'roti', 'paratha'])) return const ItemKind('🫓', false);
  if (has(['finger', 'fries', 'chips']) && !has(["lay's", 'lays'])) return const ItemKind('🍟', false);
  if (has(['corn'])) return const ItemKind('🌽', false);
  if (has(['peanut'])) return const ItemKind('🥜', false);
  if (has(['chana'])) return const ItemKind('🫘', false);
  if (has(["lay's", 'lays', 'kurkure'])) return const ItemKind('🍿', false);
  if (has(['choco', 'dairy milk', 'cadbury'])) return const ItemKind('🍫', false);
  if (c.contains('drink')) return const ItemKind('🥤', true);
  return const ItemKind('🍛', false);
}

/// A small round badge with the item's emoji, plus a food or drink glyph.
class ItemBadge extends StatelessWidget {
  const ItemBadge({super.key, required this.kind, this.size = 38});
  final ItemKind kind;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: Brand.ink,
        shape: BoxShape.circle,
        border: Border.all(color: kind.drink ? Brand.neonGlow : Brand.gold, width: 2),
        boxShadow: [BoxShadow(color: (kind.drink ? Brand.neon : Brand.gold).withValues(alpha: 0.35), blurRadius: 10)],
      ),
      child: Text(kind.emoji, style: TextStyle(fontSize: size * 0.5, height: 1.1)),
    );
  }
}

/// "Food" or "Drink" tag with an icon.
class KindTag extends StatelessWidget {
  const KindTag({super.key, required this.kind});
  final ItemKind kind;

  @override
  Widget build(BuildContext context) {
    final c = kind.drink ? Brand.neonGlow : Brand.gold;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(kind.drink ? Icons.local_drink_rounded : Icons.restaurant_rounded, size: 12, color: c),
        const SizedBox(width: 3),
        Text(kind.drink ? 'DRINK' : 'FOOD', style: TextStyle(color: c, fontSize: 10, fontWeight: FontWeight.w700, letterSpacing: 1)),
      ]),
    );
  }
}

/// Icon for a whole category, for tabs.
String categoryEmoji(Category c) {
  switch (c.id) {
    case 'momos':
      return '🥟';
    case 'chaap':
      return '🍢';
    case 'paneer':
      return '🧀';
    case 'chinese':
      return '🥡';
    case 'snacks':
      return '🍟';
    case 'breads':
      return '🫓';
    case 'drinks':
      return '☕';
    case 'cold-drinks':
      return '🥤';
    case 'packaged-snacks':
      return '🍿';
  }
  return c.items.isEmpty ? '🍛' : itemKind(c.items.first.name, c.name).emoji;
}

/// Fades and slides a child in, delayed by its position in a list, so cards cascade onto the screen.
class Entrance extends StatefulWidget {
  const Entrance({super.key, required this.child, this.index = 0, this.offset = 28});
  final Widget child;
  final int index;
  final double offset;

  @override
  State<Entrance> createState() => _EntranceState();
}

class _EntranceState extends State<Entrance> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 520));

  @override
  void initState() {
    super.initState();
    Future.delayed(Duration(milliseconds: 45 * math.min(widget.index, 10)), () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.of(context).disableAnimations) return widget.child;
    final a = CurvedAnimation(parent: _c, curve: Curves.easeOutCubic);
    return AnimatedBuilder(
      animation: a,
      builder: (_, child) => Opacity(
        opacity: a.value,
        child: Transform.translate(offset: Offset(0, widget.offset * (1 - a.value)), child: child),
      ),
      child: widget.child,
    );
  }
}

/// Briefly scales its child up whenever [trigger] changes, for "added to cart" feedback.
class Bump extends StatefulWidget {
  const Bump({super.key, required this.trigger, required this.child});
  final Object trigger;
  final Widget child;

  @override
  State<Bump> createState() => _BumpState();
}

class _BumpState extends State<Bump> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 360));

  @override
  void didUpdateWidget(Bump old) {
    super.didUpdateWidget(old);
    if (old.trigger != widget.trigger) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) => Transform.scale(scale: 1 + 0.16 * math.sin(_c.value * math.pi), child: child),
      child: widget.child,
    );
  }
}

/// A slow glowing gradient behind headers: the LED strip look from the cart.
class GlowBackdrop extends StatefulWidget {
  const GlowBackdrop({super.key, required this.child});
  final Widget child;

  @override
  State<GlowBackdrop> createState() => _GlowBackdropState();
}

class _GlowBackdropState extends State<GlowBackdrop> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 8))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, child) {
        final t = _c.value * 2 * math.pi;
        return DecoratedBox(
          decoration: BoxDecoration(
            gradient: RadialGradient(
              center: Alignment(math.cos(t) * 0.8, -0.6 + math.sin(t) * 0.3),
              radius: 1.3,
              colors: [Brand.neon.withValues(alpha: ThemeController.instance.isDark ? 0.35 : 0.16), Colors.transparent],
            ),
          ),
          child: child,
        );
      },
      child: widget.child,
    );
  }
}

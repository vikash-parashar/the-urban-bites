import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'theme.dart';

/// The boot animation. The Android launch screen shows the logo on navy; this picks up from
/// there: the logo drops in, the LED roof line draws itself, steam rises, and the name slides up.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key, required this.next});
  final Widget next;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 2600));
  bool _gone = false;

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(_go);
  }

  void _go() {
    if (_gone || !mounted) return;
    _gone = true;
    Navigator.of(context).pushReplacement(PageRouteBuilder(
      transitionDuration: const Duration(milliseconds: 650),
      pageBuilder: (_, __, ___) => widget.next,
      transitionsBuilder: (_, a, __, child) => FadeTransition(
        opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
        child: ScaleTransition(scale: Tween(begin: 1.04, end: 1.0).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)), child: child),
      ),
    ));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  Animation<double> _seg(double a, double b, [Curve curve = Curves.easeOutCubic]) =>
      CurvedAnimation(parent: _c, curve: Interval(a, b, curve: curve));

  @override
  Widget build(BuildContext context) {
    final logoIn = _seg(0.0, 0.38, Curves.elasticOut);
    final roof = _seg(0.22, 0.55);
    final steam = _seg(0.40, 1.0, Curves.linear);
    final name = _seg(0.45, 0.72);
    final tag = _seg(0.62, 0.88);
    final glow = _seg(0.3, 1.0, Curves.easeInOut);
    final size = math.min(MediaQuery.sizeOf(context).shortestSide * 0.42, 220.0);

    return Scaffold(
      backgroundColor: Brand.navy,
      body: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _go,
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            return Stack(fit: StackFit.expand, children: [
              // Soft blue light behind the logo, like the cart's LED strip at night.
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: RadialGradient(
                    center: const Alignment(0, -0.25),
                    radius: 0.55 + 0.35 * glow.value,
                    colors: [Brand.neon.withValues(alpha: 0.42 * glow.value), const Color(0x00070A1C)],
                  ),
                ),
              ),
              CustomPaint(painter: _SparkPainter(_c.value)),
              Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  SizedBox(
                    width: size,
                    height: size * 1.25,
                    child: Stack(alignment: Alignment.bottomCenter, children: [
                      Positioned.fill(child: CustomPaint(painter: _SteamPainter(steam.value))),
                      Transform.scale(
                        scale: 0.2 + 0.8 * logoIn.value,
                        child: Opacity(
                          opacity: (logoIn.value * 2).clamp(0, 1).toDouble(),
                          child: SizedBox(
                            width: size,
                            height: size,
                            child: Stack(children: [
                              Image.asset('assets/mark-512.png', width: size, height: size),
                              CustomPaint(size: Size(size, size), painter: _RoofPainter(roof.value)),
                            ]),
                          ),
                        ),
                      ),
                    ]),
                  ),
                  const SizedBox(height: 22),
                  Opacity(
                    opacity: name.value,
                    child: Transform.translate(
                      offset: Offset(0, 24 * (1 - name.value)),
                      child: Column(children: [
                        const Text('THE', style: TextStyle(fontFamily: Brand.display, color: Color(0xFFA4ABD0), letterSpacing: 6, fontSize: 14)),
                        Text.rich(TextSpan(children: [
                          const TextSpan(text: 'URBAN ', style: TextStyle(fontFamily: Brand.display, color: Color(0xFFF7F0E1), fontSize: 40, letterSpacing: 2)),
                          TextSpan(
                            text: 'Bites',
                            style: TextStyle(
                              fontFamily: Brand.hand,
                              fontWeight: FontWeight.w700,
                              color: const Color(0xFFF4B43A),
                              fontSize: 44,
                              shadows: [Shadow(color: const Color(0xFFF4B43A).withValues(alpha: 0.6), blurRadius: 18)],
                            ),
                          ),
                        ])),
                      ]),
                    ),
                  ),
                  const SizedBox(height: 10),
                  Opacity(
                    opacity: tag.value,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(30),
                        border: Border.all(color: const Color(0xFF3D5CFF), width: 1.2),
                      ),
                      child: const Text(
                        'Momos · Chaap · Chai — Julana Bypass',
                        style: TextStyle(fontFamily: 'Hind', color: Color(0xFFF7F0E1), fontSize: 13, letterSpacing: 0.5),
                      ),
                    ),
                  ),
                ]),
              ),
            ]);
          },
        ),
      ),
    );
  }
}

/// Draws a bright pulse travelling along the logo's LED roof line.
class _RoofPainter extends CustomPainter {
  _RoofPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    if (t <= 0) return;
    final s = size.width / 512;
    final path = Path()
      ..moveTo(96 * s, 214 * s)
      ..lineTo(256 * s, 104 * s)
      ..lineTo(416 * s, 214 * s);
    final metric = path.computeMetrics().first;
    final drawn = metric.extractPath(0, metric.length * t);
    final fade = t < 1 ? 1.0 : 0.0;
    canvas.drawPath(
      drawn,
      Paint()
        ..color = const Color(0xFFB8C6FF).withValues(alpha: 0.9 * fade + 0.1)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6 * s
        ..strokeCap = StrokeCap.round
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    );
    final tip = metric.getTangentForOffset(metric.length * t)?.position;
    if (tip != null && t < 1) {
      canvas.drawCircle(tip, 10 * s, Paint()..color = Colors.white..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6));
    }
  }

  @override
  bool shouldRepaint(_RoofPainter old) => old.t != t;
}

/// Three wisps of steam rising above the logo.
class _SteamPainter extends CustomPainter {
  _SteamPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    if (t <= 0) return;
    final w = size.width;
    final top = size.height - w; // logo's top edge
    for (var i = 0; i < 3; i++) {
      final phase = (t * 1.6 + i * 0.33) % 1.0;
      final x = w * (0.40 + i * 0.1);
      final y0 = top + w * 0.16 - phase * w * 0.32;
      final p = Path()..moveTo(x, y0 + w * 0.14);
      p.cubicTo(x - w * 0.05, y0 + w * 0.09, x + w * 0.05, y0 + w * 0.05, x, y0);
      canvas.drawPath(
        p,
        Paint()
          ..color = const Color(0xFFF6EFE0).withValues(alpha: (1 - phase) * 0.55 * math.min(t * 4, 1))
          ..style = PaintingStyle.stroke
          ..strokeWidth = w * 0.014
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  @override
  bool shouldRepaint(_SteamPainter old) => old.t != t;
}

/// Gold sparks drifting up from the bottom, like embers off the tandoor.
class _SparkPainter extends CustomPainter {
  _SparkPainter(this.t);
  final double t;
  static final _rnd = math.Random(7);
  static final _sparks = List.generate(26, (_) => [_rnd.nextDouble(), _rnd.nextDouble(), 0.4 + _rnd.nextDouble(), 1 + _rnd.nextDouble() * 2.5]);

  @override
  void paint(Canvas canvas, Size size) {
    for (final s in _sparks) {
      final y = (s[1] - t * s[2] * 0.6) % 1.0;
      final x = s[0] + math.sin((t * 4 + s[1] * 9)) * 0.015;
      final a = (math.min(t * 3, 1.0)) * (0.25 + 0.6 * (1 - y)) * (y > 0.92 ? (1 - y) / 0.08 : 1);
      canvas.drawCircle(
        Offset(x * size.width, y * size.height),
        s[3],
        Paint()
          ..color = const Color(0xFFF4B43A).withValues(alpha: a.clamp(0, 1).toDouble())
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 1.5),
      );
    }
  }

  @override
  bool shouldRepaint(_SparkPainter old) => old.t != t;
}

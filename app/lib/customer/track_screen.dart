import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// The customer's live view of one order. Polls every 10 s; the countdown comes from the
/// time the owner set, corrected for any difference between the phone and server clocks.
class TrackScreen extends StatefulWidget {
  const TrackScreen({super.key, required this.order});
  final PlacedOrder order;

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> {
  Order? order;
  Duration clockOffset = Duration.zero;
  String? error;
  Timer? _poll;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _load());
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && order?.readyAt != null) setState(() {});
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _tick?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final (o, serverNow) = await Api.instance.track(widget.order);
      if (!mounted) return;
      setState(() {
        order = o;
        clockOffset = serverNow.difference(DateTime.now());
        error = null;
      });
      if (!o.isActive) _poll?.cancel();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    }
  }

  String _headline(Order o, bool hasClock) {
    switch (o.status) {
      case 'placed':
        return 'Waiting for the kitchen to confirm';
      case 'accepted':
      case 'preparing':
        return hasClock ? (o.isDelivery ? 'Ready to send in' : 'Ready in') : 'The kitchen is on it';
      case 'ready':
        return o.isDelivery ? 'Packed and ready to leave' : 'Ready! Come pick it up';
      case 'out_for_delivery':
        return 'On the way to you';
      case 'completed':
        return o.isDelivery ? 'Delivered. Enjoy!' : 'Collected. Enjoy!';
      default:
        return 'This order was cancelled';
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = order;
    return Scaffold(
      appBar: AppBar(title: Text('Order #${widget.order.number}')),
      body: o == null
          ? Center(child: error != null ? Text(error!) : const CircularProgressIndicator())
          : ListView(padding: pagePad(context, maxWidth: 560, top: 24, bottom: 24), children: [
              _clock(o),
              const SizedBox(height: 28),
              _steps(o),
              if (o.prepMinutes != null && (o.status == 'accepted' || o.status == 'preparing'))
                Text('The owner set ${o.prepMinutes} minutes for this order. This screen updates on its own.',
                    style: const TextStyle(color: Brand.muted)),
              if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: Brand.danger))),
              const SizedBox(height: 20),
              Text('Total ${rupees(o.total)}', style: const TextStyle(fontWeight: FontWeight.w700)),
              for (final l in o.items) Text('${l.qty} × ${l.name}${l.size == 'half' ? ' (half)' : ''}', style: const TextStyle(color: Brand.muted)),
            ]),
    );
  }

  Widget _clock(Order o) {
    final cooking = o.status == 'accepted' || o.status == 'preparing';
    final hasClock = cooking && o.readyAt != null && o.prepMinutes != null;
    var left = Duration.zero;
    var progress = o.status == 'placed' ? 0.25 : 1.0;
    if (hasClock) {
      final now = DateTime.now().add(clockOffset);
      left = o.readyAt!.difference(now);
      if (left.isNegative) left = Duration.zero;
      progress = 1 - left.inSeconds / (o.prepMinutes! * 60);
    }
    return Center(
      child: SizedBox(
        width: 240,
        height: 240,
        child: Stack(alignment: Alignment.center, children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: progress.clamp(0, 1).toDouble(),
              strokeWidth: 10,
              backgroundColor: Brand.line,
              color: hasClock || !cooking ? Brand.gold : Brand.neonGlow,
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(32),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(_headline(o, hasClock), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              if (hasClock)
                Text(
                  left == Duration.zero ? 'Any moment' : '${left.inMinutes}m ${(left.inSeconds % 60).toString().padLeft(2, '0')}s',
                  style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Brand.gold, fontFeatures: [FontFeature.tabularFigures()]),
                ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _steps(Order o) {
    final steps = o.isDelivery
        ? const [('placed', 'Order received'), ('preparing', 'Cooking'), ('out_for_delivery', 'On the way'), ('completed', 'Delivered')]
        : const [('placed', 'Order received'), ('preparing', 'Cooking'), ('ready', 'Ready to pick up'), ('completed', 'Collected')];
    const rank = {'placed': 0, 'accepted': 1, 'preparing': 1, 'ready': 2, 'out_for_delivery': 2, 'completed': 3};
    final cur = rank[o.status] ?? -1;
    if (cur < 0) return const SizedBox.shrink();
    return Column(children: [
      for (final (key, label) in steps)
        ListTile(
          dense: true,
          leading: Icon(
            rank[key]! < cur ? Icons.check_circle : (rank[key] == cur ? Icons.radio_button_checked : Icons.radio_button_unchecked),
            color: rank[key]! <= cur ? Brand.gold : Brand.line,
          ),
          title: Text(label,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: rank[key] == cur ? Brand.gold : (rank[key]! < cur ? Brand.cream : Brand.muted),
              )),
        ),
      const SizedBox(height: 8),
    ]);
  }
}

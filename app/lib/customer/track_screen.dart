import 'dart:async';

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../brand_widgets.dart';
import '../receipt.dart';
import '../theme.dart';
import '../upi.dart';
import '../validators.dart';

/// The customer's live view of one order. Polls every 10 s; the countdown comes from the
/// time the owner set, corrected for any difference between the phone and server clocks.
class TrackScreen extends StatefulWidget {
  const TrackScreen({super.key, required this.order, this.justPlaced = false, this.payNow = false});
  final PlacedOrder order;
  final bool justPlaced;
  /// The customer chose "Pay now with UPI" at checkout.
  final bool payNow;

  @override
  State<TrackScreen> createState() => _TrackScreenState();
}

class _TrackScreenState extends State<TrackScreen> {
  Order? order;
  Duration clockOffset = Duration.zero;
  String? error;
  Timer? _poll;
  Timer? _tick;
  Shop shop = Shop.fallback;
  String? myPhone;

  @override
  void initState() {
    super.initState();
    _load();
    Api.instance.shop().then((s) {
      if (mounted) setState(() => shop = s);
    }).catchError((_) {});
    Api.instance.savedCustomer().then((c) {
      final p = c['phone'];
      if (mounted && p != null && p.isNotEmpty) setState(() => myPhone = withCountryCode(p));
    });
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
      appBar: AppBar(title: Text('Order #${widget.order.number}'), actions: const [ThemeToggle()]),
      body: o == null
          ? Center(child: error != null ? Text(error!) : const CircularProgressIndicator())
          : ListView(padding: pagePad(context, maxWidth: 560, top: 16, bottom: 24), children: [
              if (widget.justPlaced) const Entrance(child: _PlacedBanner()),
              _clock(o),
              const SizedBox(height: 28),
              _steps(o),
              if (o.prepMinutes != null && (o.status == 'accepted' || o.status == 'preparing'))
                Text('The owner set ${o.prepMinutes} minutes for this order. This screen updates on its own.',
                    style: TextStyle(color: Brand.muted)),
              if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: Brand.danger))),
              const SizedBox(height: 16),
              if (shop.hasUpi && !o.isPaid && o.status != 'cancelled' && (o.paymentMethod == 'online' || widget.payNow)) ...[
                UpiPayCard(
                  upiId: shop.upiId,
                  upiName: shop.upiName,
                  amount: o.total,
                  orderNumber: o.number,
                  sentRef: o.paymentRef,
                  onRef: (ref) async {
                    await Api.instance.sendPaymentRef(widget.order, ref);
                    await _load();
                  },
                ),
                const SizedBox(height: 16),
              ],
              if (o.isPaid)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Row(children: [
                    const Icon(Icons.verified_rounded, color: Brand.ok),
                    const SizedBox(width: 8),
                    Text('Paid${o.paymentRef != null ? ' · UPI ref ${o.paymentRef}' : ''}', style: const TextStyle(fontWeight: FontWeight.w700, color: Brand.ok)),
                  ]),
                ),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Row(children: [
                      Icon(Icons.receipt_long_rounded, color: Brand.gold),
                      const SizedBox(width: 8),
                      const Expanded(child: Text('Your bill', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                      Text(rupees(o.total), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
                    ]),
                    const Divider(height: 20),
                    for (final l in o.items)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 3),
                        child: Row(children: [
                          Text(itemKind(l.name).emoji),
                          const SizedBox(width: 8),
                          Expanded(child: Text('${l.qty} × ${l.name}${l.size == 'half' ? ' (half)' : ''}')),
                          Text(rupees(l.qty * l.unitPrice), style: TextStyle(color: Brand.muted)),
                        ]),
                      ),
                    if (o.isDelivery)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Row(children: [
                          const Text('🛵'),
                          const SizedBox(width: 8),
                          const Expanded(child: Text('Delivery')),
                          Text(o.deliveryFee == 0 ? 'Free' : rupees(o.deliveryFee), style: TextStyle(color: Brand.muted)),
                        ]),
                      ),
                    const SizedBox(height: 12),
                    ReceiptActions(order: o, phone: myPhone, compact: true),
                  ]),
                ),
              ),
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
                  style: TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Brand.gold, fontFeatures: const [FontFeature.tabularFigures()]),
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

/// "Order placed" with a little celebration, shown once after checkout.
class _PlacedBanner extends StatelessWidget {
  const _PlacedBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Brand.ok.withValues(alpha: 0.14),
        border: Border.all(color: Brand.ok),
      ),
      child: const Row(children: [
        Text('🎉', style: TextStyle(fontSize: 30)),
        SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Order placed!', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            Text('The kitchen got it. Keep this screen open to see when it is ready.'),
          ]),
        ),
      ]),
    );
  }
}

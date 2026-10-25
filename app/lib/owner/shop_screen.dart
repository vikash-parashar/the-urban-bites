import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import '../validators.dart';

/// Order rules: pause online orders, minimums, free delivery, notice on the website.
class ShopScreen extends StatefulWidget {
  const ShopScreen({super.key});

  @override
  State<ShopScreen> createState() => _ShopScreenState();
}

class _ShopScreenState extends State<ShopScreen> {
  Shop? shop;
  String? error;
  bool busy = false;
  final _c = <String, TextEditingController>{
    'min_order_delivery': TextEditingController(),
    'min_order_pickup': TextEditingController(),
    'free_delivery_min': TextEditingController(),
    'free_delivery_km': TextEditingController(),
    'max_delivery_km': TextEditingController(),
    'delivery_fee': TextEditingController(),
    'notice': TextEditingController(),
    'upi_id': TextEditingController(),
    'upi_name': TextEditingController(),
  };
  final _upiForm = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    Api.instance.shop().then(_fill).catchError((Object e) {
      if (mounted) setState(() => error = e.toString());
    });
  }

  @override
  void dispose() {
    for (final c in _c.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _fill(Shop s) {
    if (!mounted) return;
    String n(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();
    setState(() {
      shop = s;
      _c['min_order_delivery']!.text = '${s.minOrderDelivery}';
      _c['min_order_pickup']!.text = '${s.minOrderPickup}';
      _c['free_delivery_min']!.text = '${s.freeDeliveryMin}';
      _c['free_delivery_km']!.text = n(s.freeDeliveryKm);
      _c['max_delivery_km']!.text = n(s.maxDeliveryKm);
      _c['delivery_fee']!.text = '${s.deliveryFee}';
      _c['notice']!.text = s.notice;
      _c['upi_id']!.text = s.upiId;
      _c['upi_name']!.text = s.upiName;
    });
  }

  Future<void> _patch(Map<String, dynamic> changes, String done) async {
    setState(() => busy = true);
    try {
      _fill(await Api.instance.updateShop(changes));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  void _saveRules() {
    final changes = <String, dynamic>{'notice': _c['notice']!.text.trim()};
    for (final k in ['min_order_delivery', 'min_order_pickup', 'free_delivery_min', 'delivery_fee']) {
      final v = int.tryParse(_c[k]!.text.trim());
      if (v == null) return showError(context, 'Amounts must be whole rupees, like 500.');
      changes[k] = v;
    }
    for (final k in ['free_delivery_km', 'max_delivery_km']) {
      final v = double.tryParse(_c[k]!.text.trim());
      if (v == null) return showError(context, 'Distances must be numbers, like 5.');
      changes[k] = v;
    }
    _patch(changes, 'Saved. The website shows it within a minute.');
  }

  Widget _field(String key, String label, {bool decimal = false}) => SizedBox(
        width: 220,
        child: TextField(
          controller: _c[key],
          keyboardType: TextInputType.numberWithOptions(decimal: decimal),
          decoration: InputDecoration(labelText: label),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final s = shop;
    if (s == null) {
      return Center(child: error != null ? Text(error!, style: TextStyle(color: Brand.danger)) : const CircularProgressIndicator());
    }
    return ListView(padding: pagePad(context, maxWidth: 820), children: [
      const Text('Shop settings', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
      const SizedBox(height: 12),
      Card(
        child: SwitchListTile(
          value: s.acceptingOrders,
          onChanged: busy ? null : (v) => _patch({'accepting_orders': v}, v ? 'Taking online orders again.' : 'Online orders paused.'),
          title: Text(s.acceptingOrders ? 'Taking online orders' : 'Online orders paused', style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: const Text('Turn off when you\'re closed or too busy. Walk-in sales still work.'),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Order rules', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            const SizedBox(height: 12),
            Wrap(spacing: 12, runSpacing: 12, children: [
              _field('min_order_delivery', 'Minimum for delivery ₹'),
              _field('min_order_pickup', 'Minimum for pickup ₹'),
              _field('free_delivery_min', 'Free delivery above ₹'),
              _field('free_delivery_km', 'Free delivery within km', decimal: true),
              _field('max_delivery_km', 'Deliver up to km', decimal: true),
              _field('delivery_fee', 'Delivery charge otherwise ₹'),
            ]),
            const SizedBox(height: 12),
            TextField(controller: _c['notice'], maxLength: 200, decoration: const InputDecoration(labelText: 'Notice on the website (optional)', hintText: 'Closed on Tuesday')),
            FilledButton(onPressed: busy ? null : _saveRules, child: const Text('Save rules')),
          ]),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _upiForm,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(children: [
                Text('📲', style: TextStyle(fontSize: 22)),
                SizedBox(width: 8),
                Text('UPI payments', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              ]),
              const SizedBox(height: 4),
              Text(
                s.hasUpi
                    ? 'Customers can pay with GPay, PhonePe or Paytm. Money goes straight to this UPI ID. No fees.'
                    : 'Add your UPI ID to let customers pay online. Leave empty to take cash only.',
                style: TextStyle(color: Brand.muted),
              ),
              const SizedBox(height: 12),
              Wrap(spacing: 12, runSpacing: 12, children: [
                SizedBox(
                  width: 300,
                  child: TextFormField(
                    controller: _c['upi_id'],
                    autocorrect: false,
                    decoration: const InputDecoration(labelText: 'UPI ID', hintText: '8398907216@ybl'),
                    validator: Validate.upiId,
                  ),
                ),
                SizedBox(
                  width: 300,
                  child: TextFormField(
                    controller: _c['upi_name'],
                    maxLength: 50,
                    decoration: const InputDecoration(labelText: 'Name shown in UPI apps'),
                    validator: (v) => (v ?? '').trim().isEmpty ? 'Enter a name' : null,
                  ),
                ),
              ]),
              Wrap(spacing: 10, runSpacing: 10, children: [
                FilledButton(
                  onPressed: busy
                      ? null
                      : () {
                          if (!_upiForm.currentState!.validate()) return;
                          _patch({'upi_id': _c['upi_id']!.text.trim(), 'upi_name': _c['upi_name']!.text.trim()}, 'UPI details saved.');
                        },
                  child: const Text('Save UPI'),
                ),
              ]),
            ]),
          ),
        ),
      ),
      const SizedBox(height: 12),
      Card(
        child: ListTile(
          title: const Text('Cart location', style: TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text(s.cartLat == null
              ? 'Not set. Set it from the staff area of the website.'
              : '${s.cartLat}, ${s.cartLng}. Delivery distance is measured from here.'),
        ),
      ),
    ]);
  }
}

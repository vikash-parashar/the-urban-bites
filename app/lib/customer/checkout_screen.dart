import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';
import 'cart.dart';
import 'track_screen.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _note = TextEditingController();
  String fulfilment = 'pickup';
  String payment = 'cash';
  bool busy = false;
  Shop shop = Shop.fallback;
  final cart = Cart.instance;

  @override
  void initState() {
    super.initState();
    Api.instance.shop().then((s) {
      if (mounted) setState(() => shop = s);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _address, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      final placed = await Api.instance.placeOrder({
        'customer_name': _name.text.trim(),
        'customer_phone': _phone.text.trim(),
        'fulfilment': fulfilment,
        if (fulfilment == 'delivery') 'address': _address.text.trim(),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        'payment_method': payment,
        'items': cart.toRequest(),
      });
      cart.clear();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => TrackScreen(order: placed)));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your cart')),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) {
          if (cart.count == 0) {
            return const Center(child: Text('Your cart is empty.', style: TextStyle(color: Brand.muted)));
          }
          final delivery = fulfilment == 'delivery';
          final min = shop.minFor(fulfilment);
          final short = cart.total >= min ? 0 : min - cart.total;
          final fee = delivery ? shop.feeFor(cart.total) : 0;
          final total = cart.total + fee;
          final canOrder = shop.acceptingOrders && short == 0;
          return Form(
            key: _form,
            child: ListView(padding: pagePad(context, maxWidth: 640), children: [
              for (final l in cart.lines)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l.item.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: l.item.half != null ? Text(l.size == 'full' ? 'Full plate' : 'Half plate') : null,
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(onPressed: () => cart.remove(l.item, l.size), icon: const Icon(Icons.remove_circle_outline), tooltip: 'Remove one'),
                    Text('${l.qty}'),
                    IconButton(onPressed: () => cart.add(l.item, l.size), icon: const Icon(Icons.add_circle_outline), tooltip: 'Add one'),
                    SizedBox(width: 64, child: Text(rupees(l.total), textAlign: TextAlign.right)),
                  ]),
                ),
              const Divider(height: 24),
              if (!shop.acceptingOrders)
                Card(
                  color: Brand.ink2,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text('Online orders are paused. ${shop.notice.isNotEmpty ? shop.notice : 'Call 83989 07216 or visit the cart.'}',
                        style: const TextStyle(color: Brand.danger, fontWeight: FontWeight.w700)),
                  ),
                ),
              if (delivery) ...[
                Row(children: [const Expanded(child: Text('Items', style: TextStyle(color: Brand.muted))), Text(rupees(cart.total))]),
                Row(children: [
                  Expanded(child: Text('Delivery (within ${shop.freeDeliveryKm.toStringAsFixed(0)} km)', style: const TextStyle(color: Brand.muted))),
                  Text(fee == 0 ? 'Free' : rupees(fee), style: TextStyle(color: fee == 0 ? Brand.gold : Brand.cream, fontWeight: FontWeight.w700)),
                ]),
                const SizedBox(height: 6),
              ],
              Row(children: [
                const Expanded(child: Text('Total', style: TextStyle(fontSize: 18))),
                Text(rupees(total), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
              ]),
              const SizedBox(height: 20),
              const Text('How do you want it?', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: 'pickup', label: Text('Pick up at the cart')),
                  ButtonSegment(value: 'delivery', label: Text('Deliver to me')),
                ],
                selected: {fulfilment},
                onSelectionChanged: (s) => setState(() => fulfilment = s.first),
              ),
              if (min > 0) ...[
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: (cart.total / min).clamp(0, 1).toDouble(),
                  minHeight: 8,
                  borderRadius: BorderRadius.circular(8),
                  color: short == 0 ? Brand.gold : Brand.neonGlow,
                  backgroundColor: Brand.ink2,
                ),
                const SizedBox(height: 6),
                Text(
                  short > 0
                      ? 'Add ${rupees(short)} more. ${delivery ? 'Delivery starts' : 'Online orders start'} at ${rupees(min)}.'
                      : delivery && fee == 0
                          ? 'You get free delivery within ${shop.freeDeliveryKm.toStringAsFixed(0)} km.'
                          : 'Minimum reached.',
                  style: TextStyle(color: short == 0 ? Brand.gold : Brand.cream),
                ),
              ],
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                textCapitalization: TextCapitalization.words,
                validator: (v) => (v ?? '').trim().isEmpty ? 'Enter your name' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _phone,
                decoration: const InputDecoration(labelText: 'Phone', hintText: '10-digit mobile'),
                keyboardType: TextInputType.phone,
                validator: (v) => RegExp(r'^\+?[0-9 ]{10,14}$').hasMatch((v ?? '').trim()) ? null : 'Enter a 10-digit mobile number',
              ),
              if (fulfilment == 'delivery') ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _address,
                  decoration: const InputDecoration(labelText: 'Delivery address', hintText: 'House, street, landmark'),
                  maxLines: 2,
                  validator: (v) => (v ?? '').trim().isEmpty ? 'Enter where to deliver' : null,
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(controller: _note, decoration: const InputDecoration(labelText: 'Note for the kitchen (optional)')),
              const SizedBox(height: 16),
              const Text('Payment', style: TextStyle(fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              SegmentedButton<String>(
                segments: [
                  ButtonSegment(value: 'cash', label: Text(fulfilment == 'pickup' ? 'Pay at the counter' : 'Cash on delivery')),
                  const ButtonSegment(value: 'online', label: Text('Pay online')),
                ],
                selected: {payment},
                onSelectionChanged: (s) => setState(() => payment = s.first),
              ),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: busy || !canOrder ? null : _submit,
                child: Text(busy
                    ? 'Sending to the kitchen…'
                    : !shop.acceptingOrders
                        ? 'Online orders paused'
                        : short > 0
                            ? 'Add ${rupees(short)} more to order'
                            : 'Place order · ${rupees(total)}'),
              ),
            ]),
          );
        },
      ),
    );
  }
}

import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../brand_widgets.dart';
import '../theme.dart';
import '../validators.dart';
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
  final _last = TextEditingController();
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
    Api.instance.savedCustomer().then((c) {
      if (!mounted) return;
      _name.text = c['first'] ?? '';
      _last.text = c['last'] ?? '';
      _phone.text = c['phone'] ?? '';
      _address.text = c['address'] ?? '';
    });
  }

  @override
  void dispose() {
    for (final c in [_name, _last, _phone, _address, _note]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Please fix the highlighted fields.')));
      return;
    }
    setState(() => busy = true);
    try {
      await Api.instance.saveCustomer({
        'first': _name.text.trim(),
        'last': _last.text.trim(),
        'phone': _phone.text.trim(),
        if (_address.text.trim().isNotEmpty) 'address': _address.text.trim(),
      });
      final placed = await Api.instance.placeOrder({
        'customer_name': Validate.fullName(_name.text, _last.text),
        'customer_phone': withCountryCode(_phone.text),
        'fulfilment': fulfilment,
        if (fulfilment == 'delivery') 'address': _address.text.trim(),
        if (_note.text.trim().isNotEmpty) 'note': _note.text.trim(),
        'payment_method': shop.hasUpi ? payment : 'cash',
        'items': cart.toRequest(),
      });
      cart.clear();
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => TrackScreen(order: placed, justPlaced: true, payNow: shop.hasUpi && payment == 'online')));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Your order'), actions: const [ThemeToggle()]),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) {
          if (cart.count == 0) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text('🛒', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 8),
                Text('Your cart is empty.', style: TextStyle(color: Brand.muted)),
                const SizedBox(height: 12),
                OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Back to the menu')),
              ]),
            );
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
                  leading: ItemBadge(kind: itemKind(l.item.name), size: 40),
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
                        style: TextStyle(color: Brand.danger, fontWeight: FontWeight.w700)),
                  ),
                ),
              if (delivery) ...[
                Row(children: [Expanded(child: Text('Items', style: TextStyle(color: Brand.muted))), Text(rupees(cart.total))]),
                Row(children: [
                  Expanded(child: Text('Delivery (within ${shop.freeDeliveryKm.toStringAsFixed(0)} km)', style: TextStyle(color: Brand.muted))),
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
              const SizedBox(height: 20),
              const _Section(icon: Icons.person_rounded, title: 'Your details'),
              const SizedBox(height: 10),
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Expanded(
                  child: TextFormField(
                    controller: _name,
                    decoration: const InputDecoration(labelText: 'First name *'),
                    textCapitalization: TextCapitalization.words,
                    autofillHints: const [AutofillHints.givenName],
                    inputFormatters: nameInput,
                    textInputAction: TextInputAction.next,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    validator: Validate.firstName,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: TextFormField(
                    controller: _last,
                    decoration: const InputDecoration(labelText: 'Last name'),
                    textCapitalization: TextCapitalization.words,
                    autofillHints: const [AutofillHints.familyName],
                    inputFormatters: nameInput,
                    textInputAction: TextInputAction.next,
                    autovalidateMode: AutovalidateMode.onUserInteraction,
                    validator: Validate.lastName,
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              MobileField(controller: _phone, label: 'Mobile number *'),
              Text('We send your bill and order updates to this number.', style: TextStyle(color: Brand.muted, fontSize: 12)),
              if (fulfilment == 'delivery') ...[
                const SizedBox(height: 12),
                TextFormField(
                  controller: _address,
                  decoration: const InputDecoration(labelText: 'Delivery address *', hintText: 'House no., street, village, landmark'),
                  maxLines: 2,
                  maxLength: 200,
                  textCapitalization: TextCapitalization.sentences,
                  autovalidateMode: AutovalidateMode.onUserInteraction,
                  validator: Validate.address,
                ),
              ],
              const SizedBox(height: 12),
              TextFormField(
                controller: _note,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'Note for the kitchen (optional)', hintText: 'Less spicy, extra chutney…'),
              ),
              const SizedBox(height: 12),
              const _Section(icon: Icons.account_balance_wallet_rounded, title: 'Payment'),
              const SizedBox(height: 10),
              _PayOption(
                selected: payment == 'cash' || !shop.hasUpi,
                emoji: '💵',
                title: fulfilment == 'pickup' ? 'Pay at the counter' : 'Cash on delivery',
                subtitle: 'Cash or UPI when you get your food',
                onTap: () => setState(() => payment = 'cash'),
              ),
              if (shop.hasUpi) ...[
                const SizedBox(height: 8),
                _PayOption(
                  selected: payment == 'online',
                  emoji: '📲',
                  title: 'Pay now with UPI',
                  subtitle: 'GPay, PhonePe, Paytm or any UPI app',
                  onTap: () => setState(() => payment = 'online'),
                ),
              ],
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

class _Section extends StatelessWidget {
  const _Section({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) => Row(children: [
        Icon(icon, size: 20, color: Brand.gold),
        const SizedBox(width: 8),
        Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
      ]);
}

class _PayOption extends StatelessWidget {
  const _PayOption({required this.selected, required this.emoji, required this.title, required this.subtitle, required this.onTap});
  final bool selected;
  final String emoji;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: selected ? Brand.gold.withValues(alpha: 0.12) : Brand.ink,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: selected ? Brand.gold : Brand.line, width: selected ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            Text(emoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w700)),
                Text(subtitle, style: TextStyle(color: Brand.muted, fontSize: 12)),
              ]),
            ),
            Icon(selected ? Icons.radio_button_checked : Icons.radio_button_off, color: selected ? Brand.gold : Brand.muted),
          ]),
        ),
      ),
    );
  }
}

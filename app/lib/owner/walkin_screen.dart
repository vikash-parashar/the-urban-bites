import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// Record a sale made at the counter. With the customer's phone it counts toward their badge,
/// and it always counts in earnings.
class WalkInScreen extends StatefulWidget {
  const WalkInScreen({super.key});

  @override
  State<WalkInScreen> createState() => _WalkInScreenState();
}

class _WalkInScreenState extends State<WalkInScreen> {
  late Future<List<Category>> _menu = Api.instance.menu(owner: true);
  final _phone = TextEditingController();
  final _name = TextEditingController();
  final _amount = TextEditingController();
  final _search = TextEditingController();
  final Map<String, int> qty = {};
  String payment = 'cash';
  bool busy = false;

  @override
  void dispose() {
    for (final c in [_phone, _name, _amount, _search]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save(Map<String, MenuItem> byId) async {
    final phone = _phone.text.trim();
    if (phone.isNotEmpty && !RegExp(r'^\+?[0-9 ]{10,14}$').hasMatch(phone)) {
      showError(context, 'Phone must be 10 digits, or leave it empty.');
      return;
    }
    final items = [
      for (final e in qty.entries)
        if (e.value > 0) {'item_id': e.key, 'size': 'full', 'qty': e.value},
    ];
    final amount = int.tryParse(_amount.text.trim());
    if (items.isEmpty && (amount == null || amount <= 0)) {
      showError(context, 'Tap the items sold, or type the amount.');
      return;
    }
    setState(() => busy = true);
    try {
      final o = await Api.instance.counterSale(name: _name.text.trim(), phone: phone, payment: payment, items: items, amount: amount);
      if (!mounted) return;
      setState(() {
        qty.clear();
        _phone.clear();
        _name.clear();
        _amount.clear();
      });
      final who = o.customerPhone.isEmpty
          ? ''
          : ' · ${o.customerName} has ${o.customerOrders} ${o.customerOrders == 1 ? 'order' : 'orders'}${o.customerBadge != null ? ' (${o.customerBadge})' : ''}';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: Brand.gold,
        content: Text('Saved #${o.number} · ${rupees(o.total)}$who', style: const TextStyle(color: Brand.night, fontWeight: FontWeight.w800)),
      ));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Category>>(
      future: _menu,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(snap.error.toString()),
              const SizedBox(height: 12),
              FilledButton(onPressed: () => setState(() => _menu = Api.instance.menu(owner: true)), child: const Text('Try again')),
            ]),
          );
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        final items = [for (final c in snap.data!) ...c.items.where((i) => i.available && i.full != null)];
        final byId = {for (final i in items) i.id: i};
        final q = _search.text.trim().toLowerCase();
        final shown = q.isEmpty ? items : items.where((i) => i.name.toLowerCase().contains(q)).toList();
        final itemsTotal = qty.entries.fold(0, (s, e) => s + (byId[e.key]?.full ?? 0) * e.value);
        final picked = qty.values.any((n) => n > 0);
        final total = picked ? itemsTotal : (int.tryParse(_amount.text) ?? 0);

        final who = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Walk-in sale', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
          const SizedBox(height: 4),
          const Text('With the customer\'s phone number, this counts toward their Urban Regulars badge.', style: TextStyle(color: Brand.muted)),
          const SizedBox(height: 16),
          TextField(controller: _phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Customer phone (for the badge)')),
          const SizedBox(height: 12),
          TextField(controller: _name, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name (optional)')),
          const SizedBox(height: 12),
          SegmentedButton<String>(
            segments: const [ButtonSegment(value: 'cash', label: Text('Cash')), ButtonSegment(value: 'online', label: Text('UPI / online'))],
            selected: {payment},
            onSelectionChanged: (s) => setState(() => payment = s.first),
          ),
          if (!picked) ...[
            const SizedBox(height: 12),
            TextField(
              controller: _amount,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Or just the amount (₹)'),
              onChanged: (_) => setState(() {}),
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(onPressed: busy ? null : () => _save(byId), child: Text(busy ? 'Saving…' : 'Save sale · ${rupees(total)}')),
        ]);

        final grid = Column(children: [
          TextField(
            controller: _search,
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Find an item'),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: GridView.builder(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(maxCrossAxisExtent: 200, mainAxisExtent: 76, mainAxisSpacing: 8, crossAxisSpacing: 8),
              itemCount: shown.length,
              itemBuilder: (_, i) {
                final it = shown[i];
                final n = qty[it.id] ?? 0;
                return Material(
                  color: n > 0 ? Brand.ink2 : Brand.ink,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: n > 0 ? Brand.gold : Brand.line, width: 1.5)),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => setState(() => qty[it.id] = n + 1),
                    onLongPress: n > 0 ? () => setState(() => qty[it.id] = n - 1) : null,
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Row(children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
                            Text(it.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800)),
                            Text(rupees(it.full!), style: const TextStyle(color: Brand.muted)),
                          ]),
                        ),
                        if (n > 0)
                          InkWell(
                            onTap: () => setState(() => qty[it.id] = n - 1),
                            customBorder: const StadiumBorder(),
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: const ShapeDecoration(color: Brand.gold, shape: StadiumBorder()),
                              child: Text('− $n', style: const TextStyle(color: Brand.night, fontWeight: FontWeight.w900)),
                            ),
                          ),
                      ]),
                    ),
                  ),
                );
              },
            ),
          ),
        ]);

        final wide = MediaQuery.sizeOf(context).width >= 900;
        if (wide) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 340, child: SingleChildScrollView(child: who)),
              const SizedBox(width: 20),
              Expanded(child: grid),
            ]),
          );
        }
        return Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Flexible(flex: 0, child: SingleChildScrollView(child: who)),
            const SizedBox(height: 16),
            Expanded(child: grid),
          ]),
        );
      },
    );
  }
}

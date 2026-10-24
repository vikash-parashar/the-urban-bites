import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// Live orders from the website and the app. Refreshes every 10 s and alerts on new orders.
/// On the tablet the list and the selected order sit side by side.
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  List<Order> orders = [];
  Duration clockOffset = Duration.zero;
  String? selectedId;
  String? error;
  bool loading = true;
  bool showAll = false;
  final Set<String> _seen = {};
  bool _firstLoad = true;
  Timer? _poll;
  Timer? _tick;

  @override
  void initState() {
    super.initState();
    _load();
    _poll = Timer.periodic(const Duration(seconds: 10), (_) => _load());
    _tick = Timer.periodic(const Duration(seconds: 15), (_) {
      if (mounted) setState(() {}); // keeps "x min ago" and countdowns fresh
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
      final (list, serverNow) = await Api.instance.ownerOrders(all: showAll);
      if (!mounted) return;
      final fresh = list.where((o) => o.status == 'placed' && !_seen.contains(o.id)).toList();
      _seen.addAll(list.map((o) => o.id));
      if (!_firstLoad && fresh.isNotEmpty) _alert(fresh);
      _firstLoad = false;
      setState(() {
        orders = list;
        clockOffset = serverNow.difference(DateTime.now());
        error = null;
        loading = false;
        if (selectedId == null && list.isNotEmpty && MediaQuery.sizeOf(context).width >= 900) selectedId = list.first.id;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          loading = false;
        });
      }
    }
  }

  void _alert(List<Order> fresh) {
    SystemSound.play(SystemSoundType.alert);
    HapticFeedback.heavyImpact();
    final o = fresh.first;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      backgroundColor: Brand.gold,
      duration: const Duration(seconds: 8),
      content: Text(
        fresh.length == 1 ? 'New order #${o.number} from ${o.customerName} · ${rupees(o.total)}' : '${fresh.length} new orders',
        style: const TextStyle(color: Brand.night, fontWeight: FontWeight.w800),
      ),
      action: SnackBarAction(label: 'Open', textColor: Brand.night, onPressed: () => _select(o)),
    ));
  }

  void _select(Order o) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    setState(() => selectedId = o.id);
    if (!wide) {
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => Scaffold(
          appBar: AppBar(title: Text('Order #${o.number}')),
          body: OrderDetail(orderId: o.id, initial: o, clockOffset: clockOffset, onChanged: _load),
        ),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= 900;
    final list = _list();
    if (!wide) return list;
    final selected = orders.where((o) => o.id == selectedId).firstOrNull;
    return Row(children: [
      SizedBox(width: 380, child: list),
      const VerticalDivider(width: 1, color: Brand.line),
      Expanded(
        child: selected == null
            ? const Center(child: Text('Pick an order to see it here.', style: TextStyle(color: Brand.muted)))
            : OrderDetail(key: ValueKey(selected.id), orderId: selected.id, initial: selected, clockOffset: clockOffset, onChanged: _load),
      ),
    ]);
  }

  Widget _list() {
    return Column(children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Row(children: [
          Text(showAll ? 'All orders (7 days)' : 'Open orders', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          const Spacer(),
          FilterChip(
            label: const Text('Show done'),
            selected: showAll,
            onSelected: (v) {
              setState(() => showAll = v);
              _load();
            },
          ),
        ]),
      ),
      if (error != null) Padding(padding: const EdgeInsets.all(12), child: Text(error!, style: const TextStyle(color: Brand.danger))),
      Expanded(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : orders.isEmpty
                ? const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No open orders. New ones from the website and the app show up here and ring the tablet.',
                          textAlign: TextAlign.center, style: TextStyle(color: Brand.muted)),
                    ),
                  )
                : RefreshIndicator(
                    onRefresh: _load,
                    child: ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: orders.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 8),
                      itemBuilder: (_, i) => _OrderTile(
                        order: orders[i],
                        selected: orders[i].id == selectedId,
                        clockOffset: clockOffset,
                        onTap: () => _select(orders[i]),
                      ),
                    ),
                  ),
      ),
    ]);
  }
}

Color statusColor(String s) => switch (s) {
      'placed' => Brand.gold,
      'accepted' || 'preparing' => Brand.neonGlow,
      'ready' || 'out_for_delivery' => Brand.ok,
      'cancelled' => Brand.danger,
      _ => Brand.muted,
    };

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = statusColor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: ShapeDecoration(color: c.withValues(alpha: 0.18), shape: StadiumBorder(side: BorderSide(color: c))),
      child: Text(statusLabels[status] ?? status, style: TextStyle(color: c, fontWeight: FontWeight.w800, fontSize: 12)),
    );
  }
}

String minutesLeft(Order o, Duration offset) {
  if (o.readyAt == null) return '';
  final left = o.readyAt!.difference(DateTime.now().add(offset));
  if (left.isNegative) return 'due now';
  return '${left.inMinutes + 1} min left';
}

class _OrderTile extends StatelessWidget {
  const _OrderTile({required this.order, required this.selected, required this.clockOffset, required this.onTap});
  final Order order;
  final bool selected;
  final Duration clockOffset;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final o = order;
    final ago = DateTime.now().difference(o.createdAt.toLocal()).inMinutes;
    final cooking = o.status == 'accepted' || o.status == 'preparing';
    return Material(
      color: selected ? Brand.ink2 : Brand.ink,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: o.status == 'placed' ? Brand.gold : (selected ? Brand.neon : Brand.line), width: o.status == 'placed' ? 2 : 1),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('#${o.number}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w900)),
              const SizedBox(width: 10),
              StatusPill(o.status),
              const Spacer(),
              Text(rupees(o.total), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            ]),
            const SizedBox(height: 6),
            Text('${o.customerName} · ${o.isDelivery ? 'Delivery' : 'Pickup'} · ${o.paymentMethod == 'cash' ? 'Cash' : 'Online'} · ${sourceLabel(o.source)}',
                style: const TextStyle(color: Brand.muted)),
            CustomerTag(order: o),
            Text(o.items.map((l) => '${l.qty}× ${l.name}${l.size == 'half' ? ' (H)' : ''}').join(', '),
                maxLines: 2, overflow: TextOverflow.ellipsis),
            const SizedBox(height: 4),
            Text(
              [ago < 1 ? 'just now' : '$ago min ago', if (cooking) minutesLeft(o, clockOffset)].where((s) => s.isNotEmpty).join(' · '),
              style: TextStyle(color: cooking ? Brand.neonGlow : Brand.muted, fontSize: 13),
            ),
          ]),
        ),
      ),
    );
  }
}

/// One order with the owner's controls: set the prep time, move it along, mark paid.
class OrderDetail extends StatefulWidget {
  const OrderDetail({super.key, required this.orderId, required this.initial, required this.clockOffset, required this.onChanged});
  final String orderId;
  final Order initial;
  final Duration clockOffset;
  final Future<void> Function() onChanged;

  @override
  State<OrderDetail> createState() => _OrderDetailState();
}

class _OrderDetailState extends State<OrderDetail> {
  late Order o = widget.initial;
  bool busy = false;

  @override
  void didUpdateWidget(covariant OrderDetail old) {
    super.didUpdateWidget(old);
    if (!busy) o = widget.initial;
  }

  Future<void> _update({String? status, int? prep, String? payment}) async {
    setState(() => busy = true);
    try {
      final updated = await Api.instance.updateOrder(o.id, status: status, prepMinutes: prep, paymentStatus: payment);
      setState(() => o = updated);
      await widget.onChanged();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _customTime() async {
    final ctrl = TextEditingController();
    final mins = await showDialog<int>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Minutes until ready'),
        content: TextField(controller: ctrl, autofocus: true, keyboardType: TextInputType.number, decoration: const InputDecoration(hintText: 'e.g. 25')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, int.tryParse(ctrl.text)), child: const Text('Set time')),
        ],
      ),
    );
    if (mins != null && mins >= 1 && mins <= 240) _update(status: o.status == 'placed' ? 'preparing' : null, prep: mins);
  }

  Future<void> _confirmCancel() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('Cancel order #${o.number}?'),
        content: const Text('The customer will see that the order was cancelled.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep order')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Brand.danger),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Cancel order'),
          ),
        ],
      ),
    );
    if (ok == true) _update(status: 'cancelled');
  }

  @override
  Widget build(BuildContext context) {
    final time = DateFormat('h:mm a').format(o.createdAt.toLocal());
    final cooking = o.status == 'accepted' || o.status == 'preparing';
    final next = switch (o.status) {
      'placed' => null, // the owner starts an order by picking a time
      'accepted' || 'preparing' => o.isDelivery ? ('out_for_delivery', 'Send out for delivery') : ('ready', 'Mark ready for pickup'),
      'ready' => ('completed', 'Picked up · close order'),
      'out_for_delivery' => ('completed', 'Delivered · close order'),
      _ => null,
    };

    return ListView(padding: const EdgeInsets.all(20), children: [
      Row(children: [
        Text('Order #${o.number}', style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w900)),
        const SizedBox(width: 12),
        StatusPill(o.status),
        const Spacer(),
        Text(time, style: const TextStyle(color: Brand.muted)),
      ]),
      const SizedBox(height: 12),
      SelectableText(o.customerPhone.isEmpty ? o.customerName : '${o.customerName} · ${o.customerPhone}',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      Text(
        '${o.isDelivery ? 'Delivery to: ${o.address ?? ''}${o.deliveryKm != null ? ' · about ${o.deliveryKm!.toStringAsFixed(1)} km' : ''}' : 'Pickup at the cart'} · from the ${sourceLabel(o.source).toLowerCase()}',
        style: const TextStyle(color: Brand.muted),
      ),
      const SizedBox(height: 4),
      CustomerTag(order: o),
      if (o.note != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text('Note: ${o.note}', style: const TextStyle(color: Brand.gold))),
      const Divider(height: 28),
      for (final l in o.items)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            SizedBox(width: 36, child: Text('${l.qty}×', style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 16))),
            Expanded(child: Text('${l.name}${l.size == 'half' ? ' (half)' : ''}', style: const TextStyle(fontSize: 16))),
            Text(rupees(l.unitPrice * l.qty)),
          ]),
        ),
      const Divider(height: 28),
      if (o.isDelivery) ...[
        Row(children: [const Expanded(child: Text('Items', style: TextStyle(color: Brand.muted))), Text(rupees(o.subtotal))]),
        Row(children: [
          const Expanded(child: Text('Delivery', style: TextStyle(color: Brand.muted))),
          Text(o.deliveryFee == 0 ? 'Free' : rupees(o.deliveryFee), style: TextStyle(color: o.deliveryFee == 0 ? Brand.gold : Brand.cream)),
        ]),
        const SizedBox(height: 8),
      ],
      Row(children: [
        Text('Total ${rupees(o.total)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900)),
        const Spacer(),
        Text('${o.paymentMethod == 'cash' ? 'Cash' : 'Online'} · ${o.paymentStatus == 'paid' ? 'Paid' : 'Not paid yet'}',
            style: TextStyle(color: o.paymentStatus == 'paid' ? Brand.ok : Brand.gold, fontWeight: FontWeight.w700)),
      ]),
      if (o.isActive) ...[
        const SizedBox(height: 24),
        Text(o.status == 'placed' ? 'Accept: how long will it take?' : 'Change the ready time',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
        if (cooking && o.readyAt != null)
          Text('Now showing the customer: ${minutesLeft(o, widget.clockOffset)} (set to ${o.prepMinutes} min)',
              style: const TextStyle(color: Brand.neonGlow)),
        const SizedBox(height: 10),
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final m in [5, 10, 15, 20, 30, 45])
            ActionChip(
              label: Text('$m min', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              onPressed: busy ? null : () => _update(status: o.status == 'placed' ? 'preparing' : null, prep: m),
            ),
          ActionChip(label: const Text('Other…'), onPressed: busy ? null : _customTime),
        ]),
        const SizedBox(height: 24),
        if (next != null) FilledButton(onPressed: busy ? null : () => _update(status: next.$1), child: Text(next.$2)),
        const SizedBox(height: 10),
        Row(children: [
          if (o.paymentStatus != 'paid')
            Expanded(child: OutlinedButton(onPressed: busy ? null : () => _update(payment: 'paid'), child: const Text('Mark paid'))),
          if (o.paymentStatus != 'paid') const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(foregroundColor: Brand.danger, side: const BorderSide(color: Brand.danger)),
              onPressed: busy ? null : _confirmCancel,
              child: const Text('Cancel order'),
            ),
          ),
        ]),
      ] else if (o.paymentStatus != 'paid' && o.status == 'completed') ...[
        const SizedBox(height: 20),
        OutlinedButton(onPressed: busy ? null : () => _update(payment: 'paid'), child: const Text('Mark paid')),
      ],
    ]);
  }
}

String sourceLabel(String s) => switch (s) { 'app' => 'App', 'counter' => 'Counter', _ => 'Website' };

String _ordinal(int n) {
  final v = n % 100;
  if (v >= 11 && v <= 13) return '${n}th';
  return '$n${switch (n % 10) { 1 => 'st', 2 => 'nd', 3 => 'rd', _ => 'th' }}';
}

/// "5th order" plus the customer's badge, so the owner can spot regulars.
class CustomerTag extends StatelessWidget {
  const CustomerTag({super.key, required this.order});
  final Order order;

  @override
  Widget build(BuildContext context) {
    final o = order;
    if (o.customerPhone.isEmpty) return const SizedBox.shrink();
    final n = o.customerOrders + (o.isActive ? 1 : 0);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text(n <= 1 ? 'First order' : '${_ordinal(n)} order', style: const TextStyle(color: Brand.muted, fontWeight: FontWeight.w700, fontSize: 13)),
        if (o.customerBadge != null) BadgeChip(o.customerBadge!),
      ]),
    );
  }
}

class BadgeChip extends StatelessWidget {
  const BadgeChip(this.name, {super.key});
  final String name;

  @override
  Widget build(BuildContext context) {
    final c = switch (name) {
      'First Bite' => const Color(0xFFFFB08A),
      'Regular' => Brand.neonGlow,
      _ => Brand.gold,
    };
    final legend = name == 'Urban Legend';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: ShapeDecoration(color: legend ? Brand.gold : c.withValues(alpha: 0.12), shape: StadiumBorder(side: BorderSide(color: c))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.star_rounded, size: 14, color: legend ? Brand.night : c),
        const SizedBox(width: 4),
        Text(name, style: TextStyle(color: legend ? Brand.night : c, fontWeight: FontWeight.w800, fontSize: 12)),
      ]),
    );
  }
}

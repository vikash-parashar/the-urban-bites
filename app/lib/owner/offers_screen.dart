import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

String _day(DateTime d) => '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
String _todayIst() => _day(DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30)));

/// Offers of the day and of the month. A dish with an offer price is charged at that price
/// automatically while the offer runs.
class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  late Future<List<Offer>> _offers = Api.instance.offers(owner: true);

  void _reload() => setState(() => _offers = Api.instance.offers(owner: true));

  bool _live(Offer o) {
    final t = _todayIst();
    return o.active && o.startsOn.compareTo(t) <= 0 && t.compareTo(o.endsOn) <= 0;
  }

  Future<void> _edit([Offer? o]) async {
    final saved = await showDialog<bool>(context: context, builder: (_) => _OfferDialog(offer: o));
    if (saved == true) {
      _reload();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(o == null ? 'Offer is live on the website.' : 'Offer updated.')));
    }
  }

  Future<void> _end(Offer o) async {
    try {
      await Api.instance.endOffer(o.id);
      _reload();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(onPressed: () => _edit(), icon: const Icon(Icons.add), label: const Text('New offer')),
      body: FutureBuilder<List<Offer>>(
        future: _offers,
        builder: (context, snap) {
          if (snap.hasError) return Center(child: Text(snap.error.toString()));
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final list = snap.data!;
          final today = _todayIst();
          return RefreshIndicator(
            onRefresh: () async => _reload(),
            child: ListView(padding: pagePad(context, bottom: 96), children: [
              const Text('Offers', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
              Text('These show on the website and in the app.', style: TextStyle(color: Brand.muted)),
              const SizedBox(height: 12),
              if (list.isEmpty) Text('No offers yet. Tap New offer.', style: TextStyle(color: Brand.muted)),
              for (final o in list)
                Card(
                  child: ListTile(
                    title: Text(o.title, style: TextStyle(fontWeight: FontWeight.w800, color: _live(o) ? Brand.cream : Brand.muted)),
                    subtitle: Text([
                      o.period == 'day' ? 'Day' : 'Month',
                      if (o.itemName != null && o.offerPrice != null) '${o.itemName} ${rupees(o.offerPrice!)}',
                      o.startsOn == o.endsOn ? o.startsOn : '${o.startsOn} to ${o.endsOn}',
                      _live(o) ? 'Live now' : !o.active ? 'Ended' : o.startsOn.compareTo(today) > 0 ? 'Upcoming' : 'Finished',
                    ].join(' · ')),
                    trailing: Wrap(spacing: 4, children: [
                      IconButton(tooltip: 'Edit', icon: const Icon(Icons.edit), onPressed: () => _edit(o)),
                      if (o.active && o.endsOn.compareTo(today) >= 0)
                        IconButton(tooltip: 'End now', icon: Icon(Icons.stop_circle_outlined, color: Brand.danger), onPressed: () => _end(o)),
                    ]),
                  ),
                ),
            ]),
          );
        },
      ),
    );
  }
}

class _OfferDialog extends StatefulWidget {
  const _OfferDialog({this.offer});
  final Offer? offer;

  @override
  State<_OfferDialog> createState() => _OfferDialogState();
}

class _OfferDialogState extends State<_OfferDialog> {
  late String period = widget.offer?.period ?? 'day';
  late final _title = TextEditingController(text: widget.offer?.title ?? '');
  late final _desc = TextEditingController(text: widget.offer?.description ?? '');
  late final _price = TextEditingController(text: widget.offer?.offerPrice?.toString() ?? '');
  late String? itemId = widget.offer?.itemId;
  late String? startsOn = widget.offer?.startsOn;
  late String? endsOn = widget.offer?.endsOn;
  final Future<List<Category>> _menu = Api.instance.menu(owner: true);
  bool busy = false;

  Future<void> _pickDate(bool start) async {
    final now = DateTime.now();
    final d = await showDatePicker(context: context, firstDate: now.subtract(const Duration(days: 1)), lastDate: now.add(const Duration(days: 366)));
    if (d != null) setState(() => start ? startsOn = _day(d) : endsOn = _day(d));
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) {
      showError(context, 'Write a headline, like "Malai Chaap at ₹199".');
      return;
    }
    final price = int.tryParse(_price.text.trim());
    setState(() => busy = true);
    try {
      await Api.instance.saveOffer({
        'period': period,
        'title': _title.text.trim(),
        'description': _desc.text.trim(),
        'item_id': itemId,
        'offer_price': itemId == null ? null : price,
        if (startsOn != null) 'starts_on': startsOn,
        if (endsOn != null) 'ends_on': endsOn,
      }, id: widget.offer?.id);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.offer == null ? 'New offer' : 'Edit offer'),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'day', label: Text('Of the day')), ButtonSegment(value: 'month', label: Text('Of the month'))],
              selected: {period},
              onSelectionChanged: (s) => setState(() {
                period = s.first;
                startsOn = null;
                endsOn = null;
              }),
            ),
            const SizedBox(height: 12),
            TextField(controller: _title, maxLength: 80, decoration: const InputDecoration(labelText: 'Headline', hintText: 'Malai Chaap at ₹199')),
            TextField(controller: _desc, maxLength: 300, decoration: const InputDecoration(labelText: 'Details (optional)')),
            FutureBuilder<List<Category>>(
              future: _menu,
              builder: (context, snap) {
                if (!snap.hasData) return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
                final items = [for (final c in snap.data!) ...c.items.where((i) => i.full != null)];
                return DropdownButtonFormField<String?>(
                  initialValue: items.any((i) => i.id == itemId) ? itemId : null,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Dish (optional)'),
                  items: [
                    const DropdownMenuItem<String?>(value: null, child: Text('No dish (general offer)')),
                    for (final i in items) DropdownMenuItem<String?>(value: i.id, child: Text('${i.name} · ${rupees(i.full!)}')),
                  ],
                  onChanged: (v) => setState(() => itemId = v),
                );
              },
            ),
            if (itemId != null) ...[
              const SizedBox(height: 12),
              TextField(controller: _price, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Offer price for the full plate (₹)')),
            ],
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: OutlinedButton(onPressed: () => _pickDate(true), child: Text('Starts ${startsOn ?? 'today'}'))),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton(onPressed: () => _pickDate(false), child: Text('Ends ${endsOn ?? (period == 'day' ? 'same day' : 'month end')}'))),
            ]),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
        FilledButton(onPressed: busy ? null : _save, child: Text(widget.offer == null ? 'Post offer' : 'Save')),
      ],
    );
  }
}

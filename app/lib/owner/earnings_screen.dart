import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// Takings from completed orders: today, last 7 days, last 30 days.
class EarningsScreen extends StatefulWidget {
  const EarningsScreen({super.key});

  @override
  State<EarningsScreen> createState() => _EarningsScreenState();
}

class _EarningsScreenState extends State<EarningsScreen> {
  int days = 1;
  late Future<Earnings> _data = _fetch();

  Future<Earnings> _fetch() {
    final today = DateTime.now();
    return Api.instance.earnings(today.subtract(Duration(days: days - 1)), today);
  }

  void _setRange(int d) => setState(() {
        days = d;
        _data = _fetch();
      });

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: () async {
        setState(() => _data = _fetch());
        await _data;
      },
      child: ListView(padding: pagePad(context, maxWidth: 900), children: [
        SegmentedButton<int>(
          segments: const [
            ButtonSegment(value: 1, label: Text('Today')),
            ButtonSegment(value: 7, label: Text('7 days')),
            ButtonSegment(value: 30, label: Text('30 days')),
          ],
          selected: {days},
          onSelectionChanged: (s) => _setRange(s.first),
        ),
        const SizedBox(height: 16),
        FutureBuilder<Earnings>(
          future: _data,
          builder: (context, snap) {
            if (snap.hasError) return Text(snap.error.toString(), style: TextStyle(color: Brand.danger));
            if (!snap.hasData) return const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()));
            final e = snap.data!;
            final maxDay = e.days.fold<int>(1, (m, d) => d.revenue > m ? d.revenue : m);
            return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Earned', style: TextStyle(color: Brand.muted)),
                    Text(rupees(e.revenue), style: TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Brand.gold)),
                    const SizedBox(height: 8),
                    Wrap(spacing: 24, runSpacing: 8, children: [
                      _Stat('Orders', '${e.orders}'),
                      _Stat('Average order', rupees(e.avgOrder)),
                      _Stat('Cash', rupees(e.cash)),
                      _Stat('Online', rupees(e.online)),
                    ]),
                  ]),
                ),
              ),
              if (days > 1 && e.days.isNotEmpty) ...[
                const SizedBox(height: 16),
                const Text('By day', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                for (final d in e.days.reversed)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(children: [
                      SizedBox(width: 90, child: Text(d.day.substring(5), style: TextStyle(color: Brand.muted))),
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(value: d.revenue / maxDay, minHeight: 14, backgroundColor: Brand.ink2, color: Brand.gold),
                        ),
                      ),
                      SizedBox(width: 90, child: Text(rupees(d.revenue), textAlign: TextAlign.right)),
                    ]),
                  ),
              ],
              const SizedBox(height: 16),
              const Text('Best sellers', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
              if (e.topItems.isEmpty)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text('No completed orders in this period yet.', style: TextStyle(color: Brand.muted))),
              for (final t in e.topItems)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(t.name),
                  subtitle: Text('${t.qty} sold'),
                  trailing: Text(rupees(t.sales), style: const TextStyle(fontWeight: FontWeight.w800)),
                ),
            ]);
          },
        ),
      ]),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(color: Brand.muted, fontSize: 12)),
      Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
    ]);
  }
}

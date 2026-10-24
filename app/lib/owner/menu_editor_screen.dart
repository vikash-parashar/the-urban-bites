import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// Change prices and switch items on or off. Changes reach the website within a minute.
class MenuEditorScreen extends StatefulWidget {
  const MenuEditorScreen({super.key});

  @override
  State<MenuEditorScreen> createState() => _MenuEditorScreenState();
}

class _MenuEditorScreenState extends State<MenuEditorScreen> {
  late Future<List<Category>> _menu = Api.instance.menu(owner: true);

  void _reload() => setState(() => _menu = Api.instance.menu(owner: true));

  Future<void> _toggle(MenuItem item, bool on) async {
    try {
      await Api.instance.updateItem(item.id, available: on);
      _reload();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _editPrice(MenuItem item) async {
    final full = TextEditingController(text: item.full?.toString() ?? '');
    final half = TextEditingController(text: item.half?.toString() ?? '');
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(item.name),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: full, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Full plate price (₹)')),
          const SizedBox(height: 12),
          TextField(controller: half, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Half plate price (₹), optional')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save price')),
        ],
      ),
    );
    if (saved != true) return;
    final f = int.tryParse(full.text.trim());
    final h = int.tryParse(half.text.trim());
    if (f == null || f < 0) {
      if (mounted) showError(context, 'Enter the full plate price as a number, like 120.');
      return;
    }
    try {
      await Api.instance.updateItem(item.id, full: f, half: h);
      _reload();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${item.name} now ${rupees(f)}')));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<List<Category>>(
      future: _menu,
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: TextButton(onPressed: _reload, child: Text('${snap.error} Tap to retry.')));
        }
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        return ListView(padding: pagePad(context, maxWidth: 900), children: [
          const Text('Tap a price to change it. Switch an item off when it runs out.', style: TextStyle(color: Brand.muted)),
          for (final c in snap.data!) ...[
            Padding(
              padding: const EdgeInsets.fromLTRB(0, 20, 0, 6),
              child: Text('${c.name}  ${c.nameHi}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Brand.gold)),
            ),
            for (final i in c.items)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: ListTile(
                  title: Text(i.name, style: TextStyle(fontWeight: FontWeight.w700, color: i.available ? Brand.cream : Brand.muted)),
                  subtitle: Text(i.nameHi),
                  onTap: () => _editPrice(i),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(
                      i.full == null ? 'Set price' : (i.half == null ? rupees(i.full!) : '${rupees(i.full!)} / ${rupees(i.half!)}'),
                      style: TextStyle(fontWeight: FontWeight.w800, color: i.full == null ? Brand.gold : Brand.cream),
                    ),
                    const SizedBox(width: 8),
                    Switch(value: i.available, onChanged: (v) => _toggle(i, v)),
                  ]),
                ),
              ),
          ],
        ]);
      },
    );
  }
}

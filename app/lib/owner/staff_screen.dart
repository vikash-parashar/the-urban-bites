import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api.dart';
import '../models.dart';
import '../theme.dart';

/// Admin only: add staff, reset passwords, switch accounts off.
class StaffScreen extends StatefulWidget {
  const StaffScreen({super.key});

  @override
  State<StaffScreen> createState() => _StaffScreenState();
}

class _StaffScreenState extends State<StaffScreen> {
  late Future<List<StaffAccount>> _staff = Api.instance.staffAccounts();

  void _reload() => setState(() => _staff = Api.instance.staffAccounts());

  Future<void> _add() async {
    final email = TextEditingController();
    final name = TextEditingController();
    final pw = TextEditingController();
    var role = 'owner';
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Add staff'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 10),
            TextField(controller: email, keyboardType: TextInputType.emailAddress, decoration: const InputDecoration(labelText: 'Email')),
            const SizedBox(height: 10),
            TextField(controller: pw, obscureText: true, decoration: const InputDecoration(labelText: 'Password (10+ characters)')),
            const SizedBox(height: 10),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'owner', label: Text('Owner')), ButtonSegment(value: 'admin', label: Text('Admin'))],
              selected: {role},
              onSelectionChanged: (s) => setD(() => role = s.first),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Add staff')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    try {
      await Api.instance.createStaff(email: email.text.trim(), name: name.text.trim(), role: role, password: pw.text);
      _reload();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _resetPassword(StaffAccount s) async {
    final pw = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('New password for ${s.name}'),
        content: TextField(controller: pw, obscureText: true, decoration: const InputDecoration(labelText: 'Password (10+ characters)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Set password')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await Api.instance.updateStaff(s.id, password: pw.text);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Password changed for ${s.name}')));
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  Future<void> _setActive(StaffAccount s, bool active) async {
    try {
      await Api.instance.updateStaff(s.id, active: active);
      _reload();
    } catch (e) {
      if (mounted) showError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final me = Api.instance.staff?.id;
    return FutureBuilder<List<StaffAccount>>(
      future: _staff,
      builder: (context, snap) {
        if (snap.hasError) return Center(child: TextButton(onPressed: _reload, child: Text('${snap.error} Tap to retry.')));
        if (!snap.hasData) return const Center(child: CircularProgressIndicator());
        return ListView(padding: pagePad(context), children: [
          Row(children: [
            const Expanded(child: Text('Staff accounts', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800))),
            FilledButton.icon(onPressed: _add, icon: const Icon(Icons.person_add), label: const Text('Add staff')),
          ]),
          const SizedBox(height: 4),
          Text('Owners run orders, menu and earnings. Admins can also manage staff.', style: TextStyle(color: Brand.muted)),
          const SizedBox(height: 12),
          for (final s in snap.data!)
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                title: Text('${s.name} · ${s.role == 'admin' ? 'Admin' : 'Owner'}', style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text(
                  '${s.email}\n${s.lastLoginAt == null ? 'Never signed in' : 'Last signed in ${DateFormat('d MMM, h:mm a').format(s.lastLoginAt!.toLocal())}'}',
                ),
                isThreeLine: true,
                trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                  IconButton(tooltip: 'Reset password', icon: const Icon(Icons.key), onPressed: () => _resetPassword(s)),
                  Switch(value: s.active, onChanged: s.id == me ? null : (v) => _setActive(s, v)),
                ]),
              ),
            ),
        ]);
      },
    );
  }
}

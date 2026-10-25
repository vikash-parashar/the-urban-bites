import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import 'theme.dart';
import 'validators.dart';

/// A standard UPI payment link. Every UPI app (GPay, PhonePe, Paytm, BHIM) opens it with the
/// owner's UPI ID and the amount filled in. The money goes straight to the owner's bank.
Uri upiUri({required String upiId, required String name, required int amount, required String note}) => Uri(
      scheme: 'upi',
      host: 'pay',
      queryParameters: {'pa': upiId, 'pn': name, 'am': amount.toStringAsFixed(2), 'tn': note, 'cu': 'INR'},
    );

/// Pay button, QR code for paying from another phone, and a box for the UPI reference.
/// UPI links don't tell the app whether the payment went through, so the customer types the
/// reference and the owner checks it against the bank SMS before marking the order paid.
class UpiPayCard extends StatefulWidget {
  const UpiPayCard({
    super.key,
    required this.upiId,
    required this.upiName,
    required this.amount,
    required this.orderNumber,
    required this.onRef,
    this.sentRef,
  });
  final String upiId;
  final String upiName;
  final int amount;
  final int orderNumber;
  final Future<void> Function(String ref) onRef;
  final String? sentRef;

  @override
  State<UpiPayCard> createState() => _UpiPayCardState();
}

class _UpiPayCardState extends State<UpiPayCard> {
  final _ref = TextEditingController();
  final _form = GlobalKey<FormState>();
  bool busy = false;
  bool showQr = false;

  @override
  void dispose() {
    _ref.dispose();
    super.dispose();
  }

  Uri get _uri => upiUri(upiId: widget.upiId, name: widget.upiName, amount: widget.amount, note: 'The Urban Bites order #${widget.orderNumber}');

  Future<void> _pay() async {
    bool ok = false;
    try {
      ok = await launchUrl(_uri, mode: LaunchMode.externalNonBrowserApplication);
    } catch (_) {}
    if (!ok && mounted) {
      setState(() => showQr = true);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No UPI app found. Scan the QR code from another phone.')));
    }
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    setState(() => busy = true);
    try {
      await widget.onRef(_ref.text.replaceAll(' ', '').toUpperCase());
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Thanks! The owner will confirm your payment.')));
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final sent = widget.sentRef != null && widget.sentRef!.isNotEmpty;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(18),
        gradient: LinearGradient(colors: [Brand.neon.withValues(alpha: 0.18), Brand.ink]),
        border: Border.all(color: Brand.neonGlow.withValues(alpha: 0.7)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          const Text('📲', style: TextStyle(fontSize: 26)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Pay ${rupees(widget.amount)} by UPI', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
              Text('To ${widget.upiName} · ${widget.upiId}', style: TextStyle(color: Brand.muted, fontSize: 12)),
            ]),
          ),
          IconButton(
            tooltip: 'Copy UPI ID',
            icon: const Icon(Icons.copy_rounded, size: 20),
            onPressed: () {
              Clipboard.setData(ClipboardData(text: widget.upiId));
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('UPI ID copied')));
            },
          ),
        ]),
        const SizedBox(height: 12),
        if (!sent) ...[
          FilledButton.icon(onPressed: _pay, icon: const Icon(Icons.account_balance_wallet_rounded), label: Text('Pay ${rupees(widget.amount)} now')),
          TextButton.icon(
            onPressed: () => setState(() => showQr = !showQr),
            icon: Icon(showQr ? Icons.expand_less : Icons.qr_code_2_rounded),
            label: Text(showQr ? 'Hide QR code' : 'Show QR code'),
          ),
        ],
        AnimatedCrossFade(
          duration: const Duration(milliseconds: 250),
          crossFadeState: showQr && !sent ? CrossFadeState.showFirst : CrossFadeState.showSecond,
          firstChild: Center(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12)),
              child: QrImageView(data: _uri.toString(), size: 190, backgroundColor: Colors.white),
            ),
          ),
          secondChild: const SizedBox(width: double.infinity),
        ),
        const SizedBox(height: 8),
        if (sent)
          Row(children: [
            const Icon(Icons.hourglass_top_rounded, color: Brand.ok),
            const SizedBox(width: 8),
            Expanded(child: Text('UPI ref ${widget.sentRef} sent. The owner will confirm it.', style: const TextStyle(fontWeight: FontWeight.w600))),
          ])
        else
          Form(
            key: _form,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(
                child: TextFormField(
                  controller: _ref,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9 ]')), LengthLimitingTextInputFormatter(35)],
                  decoration: const InputDecoration(labelText: 'Paid? Enter UPI ref no.', hintText: '12-digit UTR', isDense: true),
                  validator: Validate.upiRef,
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: OutlinedButton(onPressed: busy ? null : _send, child: Text(busy ? '…' : 'Send')),
              ),
            ]),
          ),
      ]),
    );
  }
}

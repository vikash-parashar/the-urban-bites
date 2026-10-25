import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:url_launcher/url_launcher.dart';

import 'models.dart';
import 'theme.dart';

/// Shop details printed on every bill.
const _shopName = 'THE URBAN BITES';
const _shopLines = ['Julana Bypass, near Brahmanwas, Haryana', 'Phone: 83989 07216'];
const _siteUrl = 'theurbanbites.in';

final _when = DateFormat('d MMM yyyy, h:mm a');
String _r(int n) => '₹$n';

String _sizeLabel(OrderLine l) => l.size == 'half' ? ' (half)' : '';

/// The bill as plain text, for WhatsApp and SMS.
String receiptText(Order o) {
  final b = StringBuffer()
    ..writeln('*The Urban Bites* 🧾')
    ..writeln('Bill for order #${o.number}')
    ..writeln(_when.format(o.createdAt.toLocal()))
    ..writeln(o.customerName.isEmpty ? '' : 'Customer: ${o.customerName}')
    ..writeln('--------------------');
  for (final l in o.items) {
    b.writeln('${l.qty} x ${l.name}${_sizeLabel(l)}  ${_r(l.unitPrice * l.qty)}');
  }
  b.writeln('--------------------');
  if (o.deliveryFee > 0 || o.isDelivery) {
    b
      ..writeln('Items: ${_r(o.subtotal)}')
      ..writeln('Delivery: ${o.deliveryFee == 0 ? 'Free' : _r(o.deliveryFee)}');
  }
  b
    ..writeln('*Total: ${_r(o.total)}*')
    ..writeln('Payment: ${_payLabel(o)}')
    ..writeln()
    ..writeln('Thank you! Order again at $_siteUrl or call 83989 07216.');
  return b.toString().replaceAll(RegExp(r'\n{3,}'), '\n\n');
}

String _payLabel(Order o) {
  final how = o.paymentMethod == 'online' ? 'UPI' : 'Cash';
  final ref = o.paymentRef == null || o.paymentRef!.isEmpty ? '' : ' (ref ${o.paymentRef})';
  return '$how · ${o.isPaid ? 'Paid' : 'Not paid yet'}$ref';
}

/// A 58/80 mm roll receipt, the size thermal bill printers use.
Future<Uint8List> receiptPdf(Order o, PdfPageFormat format) async {
  final regular = pw.Font.ttf(await rootBundle.load('assets/fonts/Hind-Regular.ttf'));
  final bold = pw.Font.ttf(await rootBundle.load('assets/fonts/Hind-Bold.ttf'));
  final logo = pw.MemoryImage((await rootBundle.load('assets/mark-512.png')).buffer.asUint8List());
  final doc = pw.Document(title: 'Bill #${o.number}', author: 'The Urban Bites');
  final small = pw.TextStyle(font: regular, fontSize: 8);
  final body = pw.TextStyle(font: regular, fontSize: 9);
  final strong = pw.TextStyle(font: bold, fontSize: 9);

  pw.Widget row(String a, String b, {pw.TextStyle? style}) => pw.Row(children: [
        pw.Expanded(child: pw.Text(a, style: style ?? body)),
        pw.Text(b, style: style ?? body),
      ]);

  doc.addPage(pw.Page(
    pageFormat: format,
    margin: const pw.EdgeInsets.all(8),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Center(child: pw.Image(logo, width: 42, height: 42)),
      pw.SizedBox(height: 4),
      pw.Center(child: pw.Text(_shopName, style: pw.TextStyle(font: bold, fontSize: 13, letterSpacing: 1))),
      for (final l in _shopLines) pw.Center(child: pw.Text(l, style: small)),
      pw.Divider(borderStyle: pw.BorderStyle.dashed, thickness: 0.6),
      row('Bill #${o.number}', _when.format(o.createdAt.toLocal()), style: small),
      if (o.customerName.isNotEmpty) pw.Text('Customer: ${o.customerName}', style: small),
      if (o.customerPhone.isNotEmpty) pw.Text('Phone: ${o.customerPhone}', style: small),
      pw.Text(o.isDelivery ? 'Delivery${o.address == null ? '' : ': ${o.address}'}' : (o.source == 'counter' ? 'At the counter' : 'Pick up'), style: small),
      pw.Divider(borderStyle: pw.BorderStyle.dashed, thickness: 0.6),
      row('Item', 'Amount', style: strong),
      pw.SizedBox(height: 2),
      for (final l in o.items) ...[
        pw.Text('${l.name}${_sizeLabel(l)}', style: body),
        row('  ${l.qty} x ${_r(l.unitPrice)}', _r(l.unitPrice * l.qty), style: small),
      ],
      if (o.items.isEmpty) row('Counter sale', _r(o.total)),
      pw.Divider(borderStyle: pw.BorderStyle.dashed, thickness: 0.6),
      if (o.isDelivery) ...[
        row('Items', _r(o.subtotal)),
        row('Delivery', o.deliveryFee == 0 ? 'Free' : _r(o.deliveryFee)),
      ],
      row('TOTAL', _r(o.total), style: pw.TextStyle(font: bold, fontSize: 12)),
      pw.SizedBox(height: 2),
      pw.Text('Payment: ${_payLabel(o)}', style: small),
      pw.Divider(borderStyle: pw.BorderStyle.dashed, thickness: 0.6),
      pw.Center(child: pw.Text('Thank you! Visit again', style: strong)),
      pw.Center(child: pw.Text('Order online: $_siteUrl', style: small)),
    ]),
  ));
  return doc.save();
}

/// Opens the phone's print screen (thermal printer apps, Wi-Fi printers, or "Save as PDF").
Future<void> printReceipt(Order o) async {
  await Printing.layoutPdf(
    name: 'TheUrbanBites-bill-${o.number}',
    format: PdfPageFormat.roll80,
    onLayout: (f) => receiptPdf(o, f.width > PdfPageFormat.roll80.width + 1 ? PdfPageFormat.roll80 : f),
  );
}

/// Shares the bill PDF through any app (WhatsApp, email, Drive).
Future<void> shareReceiptPdf(Order o) async {
  final bytes = await receiptPdf(o, PdfPageFormat.roll80);
  await Printing.sharePdf(bytes: bytes, filename: 'TheUrbanBites-bill-${o.number}.pdf');
}

/// The 10 digits of an Indian mobile from "+919876543210", or null.
String? tenDigits(String phone) {
  final d = phone.replaceAll(RegExp(r'\D'), '');
  if (d.length == 12 && d.startsWith('91')) return d.substring(2);
  if (d.length == 10) return d;
  return null;
}

/// Sends the bill to the customer's mobile: WhatsApp first, SMS if WhatsApp is not installed.
/// Returns false if there is no valid number.
Future<bool> sendReceipt(BuildContext context, Order o, {String? phone}) async {
  final d = tenDigits(phone ?? o.customerPhone);
  final text = receiptText(o);
  if (d == null) {
    // No number on the order: let the owner pick a chat.
    final ok = await launchUrl(Uri.parse('https://wa.me/?text=${Uri.encodeComponent(text)}'), mode: LaunchMode.externalApplication);
    return ok;
  }
  final wa = Uri.parse('https://wa.me/91$d?text=${Uri.encodeComponent(text)}');
  try {
    if (await launchUrl(wa, mode: LaunchMode.externalNonBrowserApplication)) return true;
  } catch (_) {}
  final sms = Uri(scheme: 'sms', path: '+91$d', queryParameters: {'body': text});
  try {
    if (await launchUrl(sms)) return true;
  } catch (_) {}
  return launchUrl(wa, mode: LaunchMode.externalApplication);
}

/// "Print bill" and "Send bill" buttons, used on order screens.
class ReceiptActions extends StatelessWidget {
  const ReceiptActions({super.key, required this.order, this.phone, this.compact = false});
  final Order order;
  /// The number to send to when the order itself doesn't carry one (the customer's own phone).
  final String? phone;
  final bool compact;

  Future<void> _run(BuildContext context, Future<void> Function() f) async {
    try {
      await f();
    } catch (e) {
      if (context.mounted) showError(context, 'Could not open: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final buttons = [
      OutlinedButton.icon(
        onPressed: () => _run(context, () => printReceipt(order)),
        icon: const Icon(Icons.print_rounded),
        label: const Text('Print bill'),
      ),
      FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: const Color(0xFF25D366), foregroundColor: Colors.white),
        onPressed: () => _run(context, () async {
          final ok = await sendReceipt(context, order, phone: phone);
          if (!ok && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No WhatsApp or SMS app found on this phone.')));
          }
        }),
        icon: const Icon(Icons.send_rounded),
        label: Text(compact ? 'Send bill' : 'Send bill to ${_shortPhone(phone ?? order.customerPhone)}'),
      ),
      IconButton(
        tooltip: 'Share bill as PDF',
        onPressed: () => _run(context, () => shareReceiptPdf(order)),
        icon: const Icon(Icons.ios_share_rounded),
      ),
    ];
    return Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: buttons);
  }

  String _shortPhone(String p) {
    final d = tenDigits(p);
    return d == null ? 'WhatsApp' : '${d.substring(0, 5)} ${d.substring(5)}';
  }
}

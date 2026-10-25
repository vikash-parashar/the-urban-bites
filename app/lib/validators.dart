import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme.dart';

/// Checks that match the server (api/internal/httpapi and store.NormalizePhone), so customers see
/// the problem while typing instead of after pressing the button.
class Validate {
  static final _name = RegExp(r"^[\p{L}][\p{L}\p{M} .']*$", unicode: true);

  static String? firstName(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return 'Enter your first name';
    if (s.length < 2) return 'At least 2 letters';
    if (!_name.hasMatch(s)) return 'Letters only, no numbers or symbols';
    return null;
  }

  static String? lastName(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null; // optional
    if (!_name.hasMatch(s)) return 'Letters only, no numbers or symbols';
    return null;
  }

  /// [v] is the 10 digits after +91.
  static String? mobile(String? v, {bool required = true}) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return required ? 'Enter your mobile number' : null;
    if (s.length != 10) return 'Mobile number must be 10 digits (${s.length}/10)';
    if (!RegExp(r'^[6-9]').hasMatch(s)) return 'Indian mobile numbers start with 6, 7, 8 or 9';
    return null;
  }

  static String? address(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return 'Enter where to deliver';
    if (s.length < 10) return 'Add house number, street and a landmark';
    return null;
  }

  static String? upiRef(String? v) {
    final s = (v ?? '').replaceAll(' ', '');
    if (s.isEmpty) return 'Enter the UPI reference number';
    if (!RegExp(r'^[A-Za-z0-9]{6,35}$').hasMatch(s)) return 'Copy the 12-digit UPI ref / UTR number from your payment app';
    return null;
  }

  static String? upiId(String? v) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return null;
    if (!RegExp(r'^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-]{1,64}$').hasMatch(s)) return 'Looks like name@bank, for example 8398907216@ybl';
    return null;
  }

  /// Full name for the API from the two fields.
  static String fullName(String first, String last) => [first.trim(), last.trim()].where((s) => s.isNotEmpty).join(' ');
}

/// Only lets letters, spaces, dots and apostrophes into a name field.
final nameInput = <TextInputFormatter>[
  FilteringTextInputFormatter.allow(RegExp(r"[\p{L}\p{M} .']", unicode: true)),
  LengthLimitingTextInputFormatter(28),
];

/// Turns pasted "+91 98765-43210" or "098765 43210" into the 10 digits, and blocks a 11th digit.
class _MobileFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    var d = newValue.text.replaceAll(RegExp(r'\D'), '');
    if (d.length > 10 && d.startsWith('91')) d = d.substring(2);
    if (d.length > 10 && d.startsWith('0')) d = d.substring(1);
    if (d.length > 10) d = d.substring(0, 10);
    return TextEditingValue(text: d, selection: TextSelection.collapsed(offset: d.length));
  }
}

/// A mobile number field with a fixed +91 in front. The controller holds just the 10 digits.
class MobileField extends StatelessWidget {
  const MobileField({super.key, required this.controller, this.label = 'Mobile number', this.required = true, this.onChanged});
  final TextEditingController controller;
  final String label;
  final bool required;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return TextFormField(
      controller: controller,
      keyboardType: TextInputType.phone,
      autofillHints: const [AutofillHints.telephoneNumberNational],
      inputFormatters: [_MobileFormatter()],
      maxLength: 10,
      onChanged: onChanged,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: (v) => Validate.mobile(v, required: required),
      decoration: InputDecoration(
        labelText: label,
        hintText: '98765 43210',
        prefixIcon: Padding(
          padding: const EdgeInsets.only(left: 12, right: 8),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Text('🇮🇳', style: TextStyle(fontSize: 18)),
            const SizedBox(width: 6),
            Text('+91', style: TextStyle(fontWeight: FontWeight.w700, color: Brand.cream, fontSize: 16)),
            const SizedBox(width: 8),
            Container(width: 1, height: 22, color: Brand.line),
          ]),
        ),
        prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
      ),
    );
  }
}

/// "+919876543210" from the 10 digits.
String withCountryCode(String tenDigits) => '+91${tenDigits.trim()}';

import 'package:flutter/foundation.dart';

import '../models.dart';

class CartLine {
  final MenuItem item;
  final String size;
  int qty;
  CartLine(this.item, this.size, this.qty);
  int get total => (item.price(size) ?? 0) * qty;
}

/// The customer's cart for this app session.
class Cart extends ChangeNotifier {
  Cart._();
  static final Cart instance = Cart._();

  final List<CartLine> lines = [];

  int get count => lines.fold(0, (n, l) => n + l.qty);
  int get total => lines.fold(0, (n, l) => n + l.total);

  int qtyOf(String itemId, String size) {
    for (final l in lines) {
      if (l.item.id == itemId && l.size == size) return l.qty;
    }
    return 0;
  }

  void add(MenuItem item, String size) {
    for (final l in lines) {
      if (l.item.id == item.id && l.size == size) {
        l.qty++;
        notifyListeners();
        return;
      }
    }
    lines.add(CartLine(item, size, 1));
    notifyListeners();
  }

  void remove(MenuItem item, String size) {
    for (final l in lines) {
      if (l.item.id == item.id && l.size == size) {
        l.qty--;
        if (l.qty <= 0) lines.remove(l);
        notifyListeners();
        return;
      }
    }
  }

  void clear() {
    lines.clear();
    notifyListeners();
  }

  List<Map<String, dynamic>> toRequest() =>
      lines.map((l) => {'item_id': l.item.id, 'size': l.size, 'qty': l.qty}).toList();
}

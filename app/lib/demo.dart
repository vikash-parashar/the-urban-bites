import 'dart:convert';
import 'dart:math';

import 'package:flutter/services.dart' show rootBundle;
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart' show ApiException;

/// Demo mode: build with --dart-define=DEMO=true and the app runs with no server at all.
/// Everything (menu, orders, offers, shop rules, badges, earnings) lives on the phone, so the
/// owner screens and the customer screens can be tried on one device. Orders placed from the
/// customer side show up on the owner side.
const demoMode = bool.fromEnvironment('DEMO', defaultValue: false);

/// Test logins for the demo build only. They exist nowhere else and open no real account.
const demoOwnerEmail = 'owner@demo.in';
const demoAdminEmail = 'admin@demo.in';
const demoPassword = 'urban1234';

class DemoServer {
  DemoServer._();
  static final DemoServer instance = DemoServer._();

  static const _key = 'demo_state_v1';
  static const _cartLat = 29.113493, _cartLng = 76.416352;
  static const _tiers = [('First Bite', 1), ('Regular', 3), ('Gold Regular', 10), ('Urban Legend', 25)];

  Map<String, dynamic>? _s;
  final _rand = Random();

  Future<Map<String, dynamic>> _state() async {
    if (_s != null) return _s!;
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_key);
    _s = raw != null ? jsonDecode(raw) as Map<String, dynamic> : await _seed();
    return _s!;
  }

  Future<void> _save() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, jsonEncode(_s));
  }

  /// Wipes the phone's demo data back to the starting sample.
  Future<void> reset() async {
    _s = await _seed();
    await _save();
  }

  String _id() => List.generate(16, (_) => _rand.nextInt(16).toRadixString(16)).join();
  String _now() => DateTime.now().toUtc().toIso8601String();
  String _day(DateTime t) {
    final i = t.toUtc().add(const Duration(hours: 5, minutes: 30));
    return '${i.year}-${i.month.toString().padLeft(2, '0')}-${i.day.toString().padLeft(2, '0')}';
  }

  Future<Map<String, dynamic>> _seed() async {
    final menu = jsonDecode(await rootBundle.loadString('assets/menu.json')) as Map<String, dynamic>;
    final cats = <Map<String, dynamic>>[];
    for (final c in menu['categories'] as List) {
      final cm = c as Map<String, dynamic>;
      cats.add({
        'id': cm['id'],
        'name': cm['name'],
        'name_hi': cm['name_hi'] ?? '',
        'items': [
          for (final i in cm['items'] as List)
            {
              'id': (i as Map)['id'],
              'name': i['name'],
              'name_hi': i['name_hi'] ?? '',
              'full': i['full'],
              'half': i['half'],
              'image': i['image'] ?? '',
              'available': true,
            }
        ],
      });
    }
    final today = _day(DateTime.now());
    final monthEnd = () {
      final n = DateTime.now();
      return _day(DateTime(n.year, n.month + 1, 0, 12));
    }();
    _s = {
      'categories': cats,
      'shop': {
        'accepting_orders': true,
        'min_order_delivery': 500,
        'min_order_pickup': 0,
        'free_delivery_min': 500,
        'free_delivery_km': 5,
        'max_delivery_km': 5,
        'delivery_fee': 40,
        'cart_lat': _cartLat,
        'cart_lng': _cartLng,
        'notice': '',
      },
      'offers': [
        {'id': _id(), 'period': 'day', 'title': 'Malai Chaap at ₹199', 'description': 'Full plate, today only.', 'item_id': 'malai-chaap', 'offer_price': 199, 'starts_on': today, 'ends_on': today, 'active': true},
        {'id': _id(), 'period': 'month', 'title': 'Free cold drink over ₹700', 'description': 'A 250 ml cold drink on us with any order above ₹700.', 'item_id': null, 'offer_price': null, 'starts_on': today, 'ends_on': monthEnd, 'active': true},
      ],
      'users': [
        {'id': _id(), 'email': demoOwnerEmail, 'name': 'Manjeet (demo)', 'role': 'owner', 'active': true, 'created_at': _now(), 'last_login_at': null, 'password': demoPassword},
        {'id': _id(), 'email': demoAdminEmail, 'name': 'Vikash (demo)', 'role': 'admin', 'active': true, 'created_at': _now(), 'last_login_at': null, 'password': demoPassword},
      ],
      'orders': <Map<String, dynamic>>[],
      'next_number': 1001,
    };
    // Sample history so badges, the leaderboard and earnings have something to show.
    final ago = DateTime.now().toUtc();
    void past(String name, String phone, int daysAgo, List<(String, String, int)> lines, String pay, String src) {
      final o = _build(name, phone, 'pickup', null, null, pay, src, lines, at: ago.subtract(Duration(days: daysAgo, hours: 2)));
      o['status'] = 'completed';
      o['payment_status'] = 'paid';
      (_s!['orders'] as List).add(o);
    }
    for (var d = 1; d <= 6; d++) {
      past('Ravi Kumar', '9000000001', d, [('malai-chaap', 'full', 1), ('momos', 'full', 2)], d.isEven ? 'online' : 'cash', d.isEven ? 'web' : 'counter');
    }
    past('Sita', '9000000002', 2, [('momos', 'full', 1)], 'cash', 'counter');
    past('Sita', '9000000002', 4, [('paneer-tikka', 'full', 1)], 'online', 'web');
    past('Aman', '9000000003', 3, [('kurkure-momos', 'full', 2)], 'cash', 'app');
    // Two live orders waiting for the owner.
    final live = [
      _build('Priya Sharma', '9000000004', 'delivery', 'Near the bus stand, Brahmanwas', 2.7, 'cash', 'web', [('malai-chaap', 'full', 1), ('afghani-chaap', 'full', 2)]),
      _build('Ravi Kumar', '9000000001', 'pickup', null, null, 'cash', 'app', [('momos', 'full', 1)]),
    ];
    (_s!['orders'] as List).addAll(live);
    return _s!;
  }

  Map<String, dynamic>? _item(String id) {
    for (final c in _s!['categories'] as List) {
      for (final i in (c as Map)['items'] as List) {
        if ((i as Map)['id'] == id) return i.cast<String, dynamic>();
      }
    }
    return null;
  }

  int? _offerPrice(String itemId) {
    final t = _day(DateTime.now());
    for (final o in _s!['offers'] as List) {
      final m = o as Map;
      if (m['active'] == true && m['item_id'] == itemId && m['offer_price'] != null &&
          (m['starts_on'] as String).compareTo(t) <= 0 && t.compareTo(m['ends_on'] as String) <= 0) {
        return m['offer_price'] as int;
      }
    }
    return null;
  }

  Map<String, dynamic> _build(String name, String phone, String fulfilment, String? address, double? km, String pay, String source,
      List<(String, String, int)> lines, {DateTime? at}) {
    final items = <Map<String, dynamic>>[];
    var subtotal = 0;
    for (final (id, size, qty) in lines) {
      final it = _item(id);
      if (it == null) throw ApiException(422, 'That dish is no longer on the menu.');
      final offer = size == 'full' ? _offerPrice(id) : null;
      final price = offer ?? (size == 'half' ? it['half'] : it['full']) as int?;
      if (price == null) throw ApiException(422, '${it['name']} has no $size plate.');
      if (it['available'] != true) throw ApiException(422, '${it['name']} is sold out right now.');
      items.add({'item_id': id, 'name': offer != null ? '${it['name']} (offer)' : it['name'], 'size': size, 'unit_price': price, 'qty': qty});
      subtotal += price * qty;
    }
    final shop = _s!['shop'] as Map<String, dynamic>;
    var fee = 0;
    if (fulfilment == 'delivery') {
      final inRadius = km == null || km <= (shop['free_delivery_km'] as num);
      fee = subtotal >= (shop['free_delivery_min'] as int) && inRadius ? 0 : shop['delivery_fee'] as int;
    }
    final n = _s!['next_number'] as int;
    _s!['next_number'] = n + 1;
    final created = (at ?? DateTime.now().toUtc()).toIso8601String();
    return {
      'id': _id(),
      'number': n,
      'track_token': _id(),
      'customer_name': name,
      'customer_phone': phone,
      'fulfilment': fulfilment,
      'address': address,
      'status': 'placed',
      'payment_method': pay,
      'payment_status': 'pending',
      'source': source,
      'subtotal': subtotal,
      'delivery_fee': fee,
      'delivery_km': km,
      'total': subtotal + fee,
      'prep_minutes': null,
      'ready_at': null,
      'created_at': created,
      'updated_at': created,
      'items': items,
    };
  }

  String _phoneKey(String p) {
    final d = p.replaceAll(RegExp(r'\D'), '');
    return d.length > 10 ? d.substring(d.length - 10) : d;
  }

  int _completedFor(String phone) => (_s!['orders'] as List)
      .where((o) => (o as Map)['status'] == 'completed' && _phoneKey(o['customer_phone'] as String) == _phoneKey(phone) && phone.isNotEmpty)
      .length;

  String? _badge(int n) {
    String? b;
    for (final (name, min) in _tiers) {
      if (n >= min) b = name;
    }
    return b;
  }

  Map<String, dynamic> _withBadge(Map<String, dynamic> o) {
    final n = _completedFor(o['customer_phone'] as String);
    return {...o, 'customer_orders': n, if (_badge(n) != null) 'customer_badge': _badge(n)};
  }

  Map<String, dynamic>? _user;

  /// Handles one API call the way the Go API would.
  Future<dynamic> handle(String method, String path, Object? body, Map<String, String>? query) async {
    await _state();
    await Future<void>.delayed(const Duration(milliseconds: 150));
    final b = (body as Map?)?.cast<String, dynamic>() ?? {};
    final seg = path.split('/');
    final orders = (_s!['orders'] as List).cast<Map<String, dynamic>>();
    final shop = _s!['shop'] as Map<String, dynamic>;
    final staffPath = path.startsWith('/v1/owner/') || path.startsWith('/v1/admin/');
    if (staffPath && path != '/v1/owner/login' && _user == null) {
      final prefs = await SharedPreferences.getInstance();
      final email = prefs.getString('demo_user');
      _user = (_s!['users'] as List).cast<Map<String, dynamic>>().where((u) => u['email'] == email).firstOrNull;
      if (_user == null) throw ApiException(401, 'Sign in with your staff email.');
    }

    dynamic out;
    switch ((method, path)) {
      case ('GET', '/v1/menu') || ('GET', '/v1/owner/menu'):
        final owner = path.startsWith('/v1/owner');
        out = {
          'categories': [
            for (final c in _s!['categories'] as List)
              {
                ...(c as Map).cast<String, dynamic>(),
                'items': [
                  for (final i in c['items'] as List)
                    if (owner || (i as Map)['available'] == true) {...(i as Map).cast<String, dynamic>(), 'offer_price': _offerPrice(i['id'] as String)},
                ],
              },
          ],
        };
      case ('GET', '/v1/shop'):
        out = shop;
      case ('PATCH', '/v1/owner/shop'):
        shop.addAll(b);
        out = shop;
      case ('GET', '/v1/offers') || ('GET', '/v1/owner/offers'):
        final t = _day(DateTime.now());
        final owner = path.startsWith('/v1/owner');
        out = {
          'offers': [
            for (final o in (_s!['offers'] as List).cast<Map<String, dynamic>>().reversed)
              if (owner || (o['active'] == true && (o['starts_on'] as String).compareTo(t) <= 0 && t.compareTo(o['ends_on'] as String) <= 0)) _offerOut(o),
          ],
        };
      case ('POST', '/v1/owner/offers'):
        final o = _offerIn({'id': _id(), 'active': true}, b);
        (_s!['offers'] as List).add(o);
        out = _offerOut(o);
      case ('POST', '/v1/orders'):
        if (shop['accepting_orders'] != true) throw ApiException(422, "We're not taking online orders right now. Call 8398907216 or visit the cart.");
        final name = (b['customer_name'] as String? ?? '').trim();
        final phone = (b['customer_phone'] as String? ?? '').trim();
        if (name.isEmpty || !RegExp(r'^\+?[0-9 ]{10,14}$').hasMatch(phone)) throw ApiException(422, 'Name and a 10-digit phone number are required.');
        final fulfilment = b['fulfilment'] as String? ?? 'pickup';
        double? km;
        if (b['lat'] != null && b['lng'] != null) km = _km((b['lat'] as num).toDouble(), (b['lng'] as num).toDouble());
        if (fulfilment == 'delivery' && km != null && km > (shop['max_delivery_km'] as num)) {
          throw ApiException(422, "You're about ${km.toStringAsFixed(1)} km away and we deliver within ${shop['max_delivery_km']} km. Choose pickup or call us.");
        }
        final lines = [for (final l in (b['items'] as List)) ((l as Map)['item_id'] as String, (l['size'] ?? 'full') as String, (l['qty'] as num).toInt())];
        final o = _build(name, phone, fulfilment, b['address'] as String?, km, b['payment_method'] as String? ?? 'cash', 'app', lines);
        final min = fulfilment == 'delivery' ? shop['min_order_delivery'] as int : shop['min_order_pickup'] as int;
        if ((o['subtotal'] as int) < min) {
          _s!['next_number'] = (_s!['next_number'] as int) - 1;
          throw ApiException(422, 'The minimum for $fulfilment is ₹$min. Add ₹${min - (o['subtotal'] as int)} more.');
        }
        if (b['note'] != null) o['note'] = b['note'];
        orders.add(o);
        out = {for (final k in ['id', 'number', 'track_token', 'subtotal', 'delivery_fee', 'delivery_km', 'total', 'status']) k: o[k]};
      case ('POST', '/v1/owner/login'):
        final u = (_s!['users'] as List).cast<Map<String, dynamic>>().where((u) => u['email'] == (b['email'] as String? ?? '').trim().toLowerCase()).firstOrNull;
        if (u == null || u['password'] != b['password'] || u['active'] != true) throw ApiException(401, 'Wrong email or password.');
        u['last_login_at'] = _now();
        _user = u;
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('demo_user', u['email'] as String);
        out = {'token': 'demo-${_id()}', 'user': _userOut(u)};
      case ('GET', '/v1/owner/orders'):
        final all = query?['status'] == 'all';
        final list = orders.where((o) => all || (o['status'] != 'completed' && o['status'] != 'cancelled')).toList()
          ..sort((a, b) => (b['created_at'] as String).compareTo(a['created_at'] as String));
        out = {'orders': [for (final o in list.take(100)) _withBadge(o)], 'server_time': _now()};
      case ('POST', '/v1/owner/counter-sales'):
        final items = (b['items'] as List?) ?? [];
        final lines = [for (final l in items) ((l as Map)['item_id'] as String, (l['size'] ?? 'full') as String, (l['qty'] as num).toInt())];
        final o = _build((b['customer_name'] as String?) ?? 'Walk-in', (b['customer_phone'] as String?) ?? '', 'pickup', null, null,
            b['payment_method'] as String? ?? 'cash', 'counter', lines);
        if (lines.isEmpty) {
          final amt = (b['amount'] as num?)?.toInt() ?? 0;
          if (amt <= 0) throw ApiException(422, 'Tap the items sold, or type the amount.');
          o['subtotal'] = amt;
          o['total'] = amt;
          o['items'] = [{'item_id': 'counter', 'name': 'Counter sale', 'size': 'full', 'unit_price': amt, 'qty': 1}];
        }
        o['status'] = 'completed';
        o['payment_status'] = 'paid';
        orders.add(o);
        out = _withBadge(o);
      case ('GET', '/v1/owner/earnings'):
        out = _earnings(query?['from'] ?? '', query?['to'] ?? '');
      case ('GET', '/v1/admin/users'):
        _admin();
        out = {'users': [for (final u in (_s!['users'] as List).cast<Map<String, dynamic>>()) _userOut(u)]};
      case ('POST', '/v1/admin/users'):
        _admin();
        final u = {'id': _id(), 'email': (b['email'] as String).trim().toLowerCase(), 'name': b['name'], 'role': b['role'], 'active': true, 'created_at': _now(), 'last_login_at': null, 'password': b['password']};
        (_s!['users'] as List).add(u);
        out = _userOut(u);
      default:
        out = await _withId(method, seg, b, query, orders);
    }
    await _save();
    return out == null ? null : jsonDecode(jsonEncode(out));
  }

  Future<dynamic> _withId(String method, List<String> seg, Map<String, dynamic> b, Map<String, String>? query, List<Map<String, dynamic>> orders) async {
    // /v1/orders/{id}
    if (method == 'GET' && seg.length == 4 && seg[2] == 'orders') {
      final o = orders.where((o) => o['id'] == seg[3] && o['track_token'] == query?['t']).firstOrNull;
      if (o == null) throw ApiException(404, 'Order not found.');
      return {...o, 'server_time': _now()};
    }
    // /v1/owner/orders/{id}
    if (method == 'PATCH' && seg.length == 5 && seg[3] == 'orders') {
      final o = orders.where((o) => o['id'] == seg[4]).firstOrNull ?? (throw ApiException(404, 'Order not found.'));
      if (b['prep_minutes'] != null) {
        final m = (b['prep_minutes'] as num).toInt();
        if (m < 1 || m > 240) throw ApiException(422, 'Prep time must be 1 to 240 minutes.');
        o['prep_minutes'] = m;
        o['ready_at'] = DateTime.now().toUtc().add(Duration(minutes: m)).toIso8601String();
        if (b['status'] == null && o['status'] == 'placed') o['status'] = 'preparing';
      }
      if (b['status'] != null) o['status'] = b['status'];
      if (b['payment_status'] != null) o['payment_status'] = b['payment_status'];
      if (o['status'] == 'completed' && o['payment_method'] == 'cash') o['payment_status'] = 'paid';
      o['updated_at'] = _now();
      return _withBadge(o);
    }
    // /v1/owner/menu/items/{id}
    if (method == 'PATCH' && seg.length == 6 && seg[3] == 'menu') {
      final it = _item(seg[5]) ?? (throw ApiException(404, 'Dish not found.'));
      for (final c in _s!['categories'] as List) {
        for (final i in (c as Map)['items'] as List) {
          if ((i as Map)['id'] == seg[5]) i.addAll(b);
        }
      }
      return {...it, ...b};
    }
    // /v1/owner/offers/{id} and /v1/owner/offers/{id}/end
    if (seg.length >= 5 && seg[3] == 'offers') {
      final o = (_s!['offers'] as List).cast<Map<String, dynamic>>().where((o) => o['id'] == seg[4]).firstOrNull ?? (throw ApiException(404, 'Offer not found.'));
      if (method == 'PUT') _offerIn(o, b);
      if (method == 'POST' && seg.length == 6 && seg[5] == 'end') o['active'] = false;
      return _offerOut(o);
    }
    // /v1/admin/users/{id}
    if (method == 'PATCH' && seg.length == 5 && seg[3] == 'users') {
      _admin();
      final u = (_s!['users'] as List).cast<Map<String, dynamic>>().where((u) => u['id'] == seg[4]).firstOrNull ?? (throw ApiException(404, 'Account not found.'));
      for (final k in ['active', 'password', 'role']) {
        if (b[k] != null) u[k] = b[k];
      }
      return _userOut(u);
    }
    throw ApiException(404, 'Not available in the demo.');
  }

  void _admin() {
    if (_user?['role'] != 'admin') throw ApiException(403, 'Only the admin can do this.');
  }

  /// Called on sign out so the next staff call needs a new sign-in.
  Future<void> signOut() async {
    _user = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('demo_user');
  }

  Map<String, dynamic> _userOut(Map<String, dynamic> u) => {for (final e in u.entries) if (e.key != 'password') e.key: e.value};

  Map<String, dynamic> _offerIn(Map<String, dynamic> o, Map<String, dynamic> b) {
    final now = DateTime.now();
    final period = (b['period'] as String?) ?? (o['period'] as String?) ?? 'day';
    o['period'] = period;
    o['title'] = (b['title'] as String?)?.trim() ?? o['title'];
    o['description'] = (b['description'] as String?) ?? o['description'] ?? '';
    o['item_id'] = b.containsKey('item_id') ? b['item_id'] : o['item_id'];
    o['offer_price'] = b.containsKey('offer_price') ? b['offer_price'] : o['offer_price'];
    o['starts_on'] = b['starts_on'] ?? o['starts_on'] ?? _day(now);
    o['ends_on'] = b['ends_on'] ?? o['ends_on'] ?? (period == 'day' ? o['starts_on'] : _day(DateTime(now.year, now.month + 1, 0, 12)));
    if ((o['title'] as String?)?.isEmpty ?? true) throw ApiException(422, 'Write a headline for the offer.');
    return o;
  }

  Map<String, dynamic> _offerOut(Map<String, dynamic> o) {
    final it = o['item_id'] == null ? null : _item(o['item_id'] as String);
    return {...o, if (it != null) 'item_name': it['name'], if (it != null) 'regular_price': it['full']};
  }

  Map<String, dynamic> _earnings(String from, String to) {
    final days = <String, Map<String, int>>{};
    final top = <String, Map<String, dynamic>>{};
    var revenue = 0, count = 0;
    for (final o in (_s!['orders'] as List).cast<Map<String, dynamic>>()) {
      final d = _day(DateTime.parse(o['created_at'] as String));
      if (d.compareTo(from) < 0 || d.compareTo(to) > 0) continue;
      final day = days.putIfAbsent(d, () => {'orders': 0, 'revenue': 0, 'cash': 0, 'online': 0, 'cancelled': 0});
      if (o['status'] == 'cancelled') {
        day['cancelled'] = day['cancelled']! + 1;
        continue;
      }
      if (o['status'] != 'completed') continue;
      final t = o['total'] as int;
      day['orders'] = day['orders']! + 1;
      day['revenue'] = day['revenue']! + t;
      day[o['payment_method'] == 'cash' ? 'cash' : 'online'] = day[o['payment_method'] == 'cash' ? 'cash' : 'online']! + t;
      revenue += t;
      count++;
      for (final l in (o['items'] as List).cast<Map<String, dynamic>>()) {
        final e = top.putIfAbsent(l['item_id'] as String, () => {'item_id': l['item_id'], 'name': l['name'], 'qty': 0, 'sales': 0});
        e['qty'] = (e['qty'] as int) + (l['qty'] as int);
        e['sales'] = (e['sales'] as int) + (l['qty'] as int) * (l['unit_price'] as int);
      }
    }
    final keys = days.keys.toList()..sort();
    final topList = top.values.toList()..sort((a, b) => (b['sales'] as int).compareTo(a['sales'] as int));
    return {
      'from': from,
      'to': to,
      'revenue': revenue,
      'orders': count,
      'avg_order': count == 0 ? 0 : revenue ~/ count,
      'days': [for (final k in keys) {'day': k, ...days[k]!}],
      'top_items': topList.take(8).toList(),
    };
  }

  double _km(double lat, double lng) {
    const r = pi / 180;
    final dLat = (lat - _cartLat) * r, dLng = (lng - _cartLng) * r;
    final a = pow(sin(dLat / 2), 2) + cos(_cartLat * r) * cos(lat * r) * pow(sin(dLng / 2), 2);
    return (2 * 6371 * asin(sqrt(a)) * 100).round() / 100;
  }
}

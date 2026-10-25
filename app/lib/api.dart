import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'demo.dart';
import 'models.dart';

/// Set at build time: flutter build apk --dart-define=API_URL=https://api.example.com
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8080');

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// One client for every role. The staff token lives in SharedPreferences so the tablet stays signed in.
class Api {
  Api._();
  static final Api instance = Api._();

  static const _tokenKey = 'staff_token';
  static const _staffKey = 'staff_user';
  static const _ordersKey = 'my_orders';
  static const _customerKey = 'my_details';
  String? _token;
  Staff? staff;

  /// Signed in as the owner or the admin.
  bool get isStaff => _token != null && staff != null;
  bool get isAdmin => staff?.role == 'admin';

  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString(_tokenKey);
    final raw = prefs.getString(_staffKey);
    staff = raw == null ? null : Staff.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  bool _isStaffPath(String p) => p.startsWith('/v1/owner/') || p.startsWith('/v1/admin/') || p == '/v1/me';

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query}) async {
    if (demoMode) {
      try {
        return await DemoServer.instance.handle(method, path, body, query);
      } on ApiException catch (e) {
        if (e.status == 401 && _isStaffPath(path) && path != '/v1/owner/login') await signOut();
        rethrow;
      }
    }
    final uri = Uri.parse('$apiUrl$path').replace(queryParameters: query);
    final headers = <String, String>{'Content-Type': 'application/json', 'X-Client': 'app'};
    if (_token != null && _isStaffPath(path)) headers['Authorization'] = 'Bearer $_token';
    final req = http.Request(method, uri)..headers.addAll(headers);
    if (body != null) req.body = jsonEncode(body);

    final http.Response res;
    try {
      res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 15)));
    } catch (_) {
      throw ApiException(0, 'No internet connection. Check Wi-Fi or mobile data.');
    }
    if (res.statusCode == 401 && _isStaffPath(path) && path != '/v1/owner/login') {
      await signOut();
      throw ApiException(401, 'Signed out. Sign in again with your staff email.');
    }
    if (res.statusCode >= 400) {
      String msg = 'Something went wrong (error ${res.statusCode}).';
      try {
        msg = (jsonDecode(res.body) as Map<String, dynamic>)['error'] as String? ?? msg;
      } catch (_) {}
      throw ApiException(res.statusCode, msg);
    }
    if (res.body.isEmpty) return null;
    return jsonDecode(utf8.decode(res.bodyBytes));
  }

  // ---- customer ----

  Future<List<Category>> menu({bool owner = false}) async {
    final j = await _send('GET', owner ? '/v1/owner/menu' : '/v1/menu') as Map<String, dynamic>;
    return (j['categories'] as List).map((e) => Category.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PlacedOrder> placeOrder(Map<String, dynamic> order) async {
    final j = await _send('POST', '/v1/orders', body: order) as Map<String, dynamic>;
    final placed = PlacedOrder.fromJson(j);
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_ordersKey) ?? [];
    await prefs.setStringList(_ordersKey, [jsonEncode(placed.toJson()), ...list].take(5).toList());
    return placed;
  }

  Future<List<PlacedOrder>> myOrders() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getStringList(_ordersKey) ?? [])
        .map((s) => PlacedOrder.fromJson(jsonDecode(s) as Map<String, dynamic>))
        .toList();
  }

  /// Returns the order plus the server clock, so countdowns don't depend on the phone's clock.
  Future<(Order, DateTime)> track(PlacedOrder o) async {
    final j = await _send('GET', '/v1/orders/${o.id}', query: {'t': o.token}) as Map<String, dynamic>;
    j['customer_name'] ??= '';
    j['payment_method'] ??= 'cash';
    return (Order.fromJson(j), DateTime.parse(j['server_time'] as String));
  }

  /// Sends the UPI reference (UTR) the customer got after paying, so the owner can match it.
  Future<void> sendPaymentRef(PlacedOrder o, String ref) async {
    await _send('POST', '/v1/orders/${o.id}/payment', body: {'t': o.token, 'ref': ref});
  }

  /// Name, phone and address from the last order on this phone, to fill the next checkout.
  Future<Map<String, String>> savedCustomer() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_customerKey);
    if (raw == null) return {};
    return (jsonDecode(raw) as Map<String, dynamic>).map((k, v) => MapEntry(k, v as String));
  }

  Future<void> saveCustomer(Map<String, String> c) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_customerKey, jsonEncode(c));
  }

  Future<Shop> shop() async => Shop.fromJson(await _send('GET', '/v1/shop') as Map<String, dynamic>);

  Future<List<Offer>> offers({bool owner = false}) async {
    final j = await _send('GET', owner ? '/v1/owner/offers' : '/v1/offers') as Map<String, dynamic>;
    return (j['offers'] as List).map((e) => Offer.fromJson(e as Map<String, dynamic>)).toList();
  }

  // ---- owner ----

  Future<Shop> updateShop(Map<String, dynamic> changes) async =>
      Shop.fromJson(await _send('PATCH', '/v1/owner/shop', body: changes) as Map<String, dynamic>);

  /// body: period, title, description, item_id?, offer_price?, starts_on?, ends_on?
  Future<void> saveOffer(Map<String, dynamic> body, {String? id}) async {
    await _send(id == null ? 'POST' : 'PUT', id == null ? '/v1/owner/offers' : '/v1/owner/offers/$id', body: body);
  }

  Future<void> endOffer(String id) async => _send('POST', '/v1/owner/offers/$id/end');

  /// A walk-in sale: saved as completed and paid, counts in earnings and the customer's badge.
  Future<Order> counterSale({String? name, String? phone, required String payment, List<Map<String, dynamic>>? items, int? amount}) async {
    final j = await _send('POST', '/v1/owner/counter-sales', body: {
      if (name != null && name.isNotEmpty) 'customer_name': name,
      if (phone != null && phone.isNotEmpty) 'customer_phone': phone,
      'payment_method': payment,
      if (items != null && items.isNotEmpty) 'items': items else 'amount': amount ?? 0,
    }) as Map<String, dynamic>;
    return Order.fromJson(j);
  }

  Future<void> signIn(String email, String password) async {
    final j = await _send('POST', '/v1/owner/login', body: {'email': email, 'password': password}) as Map<String, dynamic>;
    _token = j['token'] as String;
    staff = Staff.fromJson(j['user'] as Map<String, dynamic>);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, _token!);
    await prefs.setString(_staffKey, jsonEncode(staff!.toJson()));
  }

  Future<void> signOut() async {
    if (demoMode) await DemoServer.instance.signOut();
    _token = null;
    staff = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_staffKey);
  }

  Future<(List<Order>, DateTime)> ownerOrders({bool all = false}) async {
    final j = await _send('GET', '/v1/owner/orders', query: {'status': all ? 'all' : 'active'}) as Map<String, dynamic>;
    final orders = (j['orders'] as List).map((e) => Order.fromJson(e as Map<String, dynamic>)).toList();
    return (orders, DateTime.parse(j['server_time'] as String));
  }

  Future<Order> updateOrder(String id, {String? status, int? prepMinutes, String? paymentStatus}) async {
    final j = await _send('PATCH', '/v1/owner/orders/$id', body: {
      if (status != null) 'status': status,
      if (prepMinutes != null) 'prep_minutes': prepMinutes,
      if (paymentStatus != null) 'payment_status': paymentStatus,
    }) as Map<String, dynamic>;
    return Order.fromJson(j);
  }

  Future<void> updateItem(String id, {int? full, int? half, bool? available}) async {
    await _send('PATCH', '/v1/owner/menu/items/$id', body: {
      if (full != null) 'full': full,
      if (half != null) 'half': half,
      if (available != null) 'available': available,
    });
  }

  Future<Earnings> earnings(DateTime from, DateTime to) async {
    String d(DateTime t) => '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
    final j = await _send('GET', '/v1/owner/earnings', query: {'from': d(from), 'to': d(to)}) as Map<String, dynamic>;
    return Earnings.fromJson(j);
  }

  // ---- admin ----

  Future<List<StaffAccount>> staffAccounts() async {
    final j = await _send('GET', '/v1/admin/users') as Map<String, dynamic>;
    return (j['users'] as List).map((e) => StaffAccount.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> createStaff({required String email, required String name, required String role, required String password}) async {
    await _send('POST', '/v1/admin/users', body: {'email': email, 'name': name, 'role': role, 'password': password});
  }

  Future<void> updateStaff(String id, {bool? active, String? password, String? role}) async {
    await _send('PATCH', '/v1/admin/users/$id', body: {
      if (active != null) 'active': active,
      if (password != null) 'password': password,
      if (role != null) 'role': role,
    });
  }
}

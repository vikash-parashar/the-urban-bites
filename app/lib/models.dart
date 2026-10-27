// JSON shapes from the Go API (see api/internal/store).

int? _int(dynamic v) => v == null ? null : (v as num).toInt();

class MenuItem {
  final String id;
  final String name;
  final String nameHi;
  final int? full;
  final int? half;
  final String image;
  final bool available;
  /// Today's offer price for the full plate, set by the owner's offers.
  final int? offerPrice;

  MenuItem({
    required this.id,
    required this.name,
    required this.nameHi,
    required this.full,
    required this.half,
    required this.image,
    required this.available,
    this.offerPrice,
  });

  factory MenuItem.fromJson(Map<String, dynamic> j) => MenuItem(
        id: j['id'] as String,
        name: j['name'] as String,
        nameHi: (j['name_hi'] ?? '') as String,
        full: _int(j['full']),
        half: _int(j['half']),
        image: (j['image'] ?? '') as String,
        available: (j['available'] ?? true) as bool,
        offerPrice: _int(j['offer_price']),
      );

  bool get orderable => available && full != null;
  int? price(String size) => size == 'half' ? half : (offerPrice ?? full);
}

class Category {
  final String id;
  final String name;
  final String nameHi;
  final List<MenuItem> items;

  Category({required this.id, required this.name, required this.nameHi, required this.items});

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: j['id'] as String,
        name: j['name'] as String,
        nameHi: (j['name_hi'] ?? '') as String,
        items: (j['items'] as List).map((e) => MenuItem.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class OrderLine {
  final String itemId;
  final String name;
  final String size;
  final int unitPrice;
  final int qty;

  OrderLine({required this.itemId, required this.name, required this.size, required this.unitPrice, required this.qty});

  factory OrderLine.fromJson(Map<String, dynamic> j) => OrderLine(
        itemId: j['item_id'] as String,
        name: j['name'] as String,
        size: j['size'] as String,
        unitPrice: _int(j['unit_price'])!,
        qty: _int(j['qty'])!,
      );
}

/// Order statuses in the order the owner moves through them.
const statusLabels = <String, String>{
  'placed': 'New',
  'accepted': 'Accepted',
  'preparing': 'Cooking',
  'ready': 'Ready',
  'out_for_delivery': 'Out for delivery',
  'completed': 'Done',
  'cancelled': 'Cancelled',
};

class Order {
  final String id;
  final int number;
  final String customerName;
  final String customerPhone;
  final String fulfilment;
  final String? address;
  final String? note;
  final String status;
  final String paymentMethod;
  final String paymentStatus;
  final String source; // web, app or counter
  final int subtotal;
  final int deliveryFee;
  final double? deliveryKm;
  final int total;
  final int? prepMinutes;
  final DateTime? readyAt;
  final DateTime createdAt;
  final List<OrderLine> items;
  /// Finished orders on this phone number, and its badge (owner lists only).
  final int customerOrders;
  final String? customerBadge;
  /// UPI reference (UTR) the customer typed after paying.
  final String? paymentRef;

  Order({
    required this.id,
    required this.number,
    required this.customerName,
    required this.customerPhone,
    required this.fulfilment,
    required this.address,
    required this.note,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.source,
    required this.subtotal,
    required this.deliveryFee,
    required this.deliveryKm,
    required this.total,
    required this.prepMinutes,
    required this.readyAt,
    required this.createdAt,
    required this.items,
    required this.customerOrders,
    required this.customerBadge,
    this.paymentRef,
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
        id: j['id'] as String,
        number: _int(j['number'])!,
        customerName: (j['customer_name'] ?? '') as String,
        customerPhone: (j['customer_phone'] ?? '') as String,
        fulfilment: j['fulfilment'] as String,
        address: j['address'] as String?,
        note: j['note'] as String?,
        status: j['status'] as String,
        paymentMethod: (j['payment_method'] ?? 'cash') as String,
        paymentStatus: (j['payment_status'] ?? 'pending') as String,
        source: (j['source'] ?? 'web') as String,
        subtotal: _int(j['subtotal']) ?? _int(j['total'])!,
        deliveryFee: _int(j['delivery_fee']) ?? 0,
        deliveryKm: (j['delivery_km'] as num?)?.toDouble(),
        total: _int(j['total'])!,
        prepMinutes: _int(j['prep_minutes']),
        readyAt: j['ready_at'] == null ? null : DateTime.parse(j['ready_at'] as String),
        createdAt: j['created_at'] == null ? DateTime.now() : DateTime.parse(j['created_at'] as String),
        items: ((j['items'] ?? []) as List).map((e) => OrderLine.fromJson(e as Map<String, dynamic>)).toList(),
        customerOrders: _int(j['customer_orders']) ?? 0,
        customerBadge: j['customer_badge'] as String?,
        paymentRef: j['payment_ref'] as String?,
      );

  bool get isDelivery => fulfilment == 'delivery';
  bool get isActive => status != 'completed' && status != 'cancelled';
  bool get isPaid => paymentStatus == 'paid';
}

/// What the customer keeps on the phone to track an order they placed.
class PlacedOrder {
  final String id;
  final int number;
  final String token;
  final int total;

  PlacedOrder({required this.id, required this.number, required this.token, required this.total});

  factory PlacedOrder.fromJson(Map<String, dynamic> j) => PlacedOrder(
        id: j['id'] as String,
        number: _int(j['number'])!,
        token: (j['track_token'] ?? j['token']) as String,
        total: _int(j['total'])!,
      );

  Map<String, dynamic> toJson() => {'id': id, 'number': number, 'token': token, 'total': total};
}

class DayEarnings {
  final String day;
  final int orders;
  final int revenue;
  final int cash;
  final int online;

  DayEarnings({required this.day, required this.orders, required this.revenue, required this.cash, required this.online});

  factory DayEarnings.fromJson(Map<String, dynamic> j) => DayEarnings(
        day: j['day'] as String,
        orders: _int(j['orders'])!,
        revenue: _int(j['revenue'])!,
        cash: _int(j['cash'])!,
        online: _int(j['online'])!,
      );
}

class TopItem {
  final String name;
  final int qty;
  final int sales;

  TopItem({required this.name, required this.qty, required this.sales});

  factory TopItem.fromJson(Map<String, dynamic> j) =>
      TopItem(name: j['name'] as String, qty: _int(j['qty'])!, sales: _int(j['sales'])!);
}

class Earnings {
  final int revenue;
  final int orders;
  final int avgOrder;
  final List<DayEarnings> days;
  final List<TopItem> topItems;

  Earnings({required this.revenue, required this.orders, required this.avgOrder, required this.days, required this.topItems});

  factory Earnings.fromJson(Map<String, dynamic> j) => Earnings(
        revenue: _int(j['revenue'])!,
        orders: _int(j['orders'])!,
        avgOrder: _int(j['avg_order'])!,
        days: (j['days'] as List).map((e) => DayEarnings.fromJson(e as Map<String, dynamic>)).toList(),
        topItems: (j['top_items'] as List).map((e) => TopItem.fromJson(e as Map<String, dynamic>)).toList(),
      );

  int get cash => days.fold(0, (s, d) => s + d.cash);
  int get online => days.fold(0, (s, d) => s + d.online);
}

/// The signed-in staff member (admin or owner).
class Staff {
  final String id;
  final String email;
  final String name;
  final String role;

  Staff({required this.id, required this.email, required this.name, required this.role});

  factory Staff.fromJson(Map<String, dynamic> j) =>
      Staff(id: j['id'] as String, email: j['email'] as String, name: j['name'] as String, role: j['role'] as String);

  Map<String, dynamic> toJson() => {'id': id, 'email': email, 'name': name, 'role': role};
}

/// A staff account as the admin sees it.
class StaffAccount {
  final String id;
  final String email;
  final String name;
  final String role;
  final bool active;
  final DateTime? lastLoginAt;

  StaffAccount({required this.id, required this.email, required this.name, required this.role, required this.active, required this.lastLoginAt});

  factory StaffAccount.fromJson(Map<String, dynamic> j) => StaffAccount(
        id: j['id'] as String,
        email: j['email'] as String,
        name: j['name'] as String,
        role: j['role'] as String,
        active: j['active'] as bool,
        lastLoginAt: j['last_login_at'] == null ? null : DateTime.parse(j['last_login_at'] as String),
      );
}

/// The owner's order rules (GET /v1/shop).
class Shop {
  final bool acceptingOrders;
  final int minOrderDelivery;
  final int minOrderPickup;
  final int freeDeliveryMin;
  final double freeDeliveryKm;
  final double maxDeliveryKm;
  final int deliveryFee;
  final double? cartLat;
  final double? cartLng;
  final String notice;
  /// The owner's UPI ID (like 8398907216@ybl). Empty means UPI is not set up yet.
  final String upiId;
  final String upiName;

  Shop({
    required this.acceptingOrders,
    required this.minOrderDelivery,
    required this.minOrderPickup,
    required this.freeDeliveryMin,
    required this.freeDeliveryKm,
    required this.maxDeliveryKm,
    required this.deliveryFee,
    required this.cartLat,
    required this.cartLng,
    required this.notice,
    this.upiId = '',
    this.upiName = 'The Urban Bites',
  });

  /// The API's defaults, used until the real rules load.
  static final fallback = Shop(
    acceptingOrders: true, minOrderDelivery: 500, minOrderPickup: 0, freeDeliveryMin: 500,
    freeDeliveryKm: 5, maxDeliveryKm: 5, deliveryFee: 40, cartLat: 29.115161, cartLng: 76.416262, notice: '',
  );

  factory Shop.fromJson(Map<String, dynamic> j) => Shop(
        acceptingOrders: j['accepting_orders'] as bool,
        minOrderDelivery: _int(j['min_order_delivery'])!,
        minOrderPickup: _int(j['min_order_pickup'])!,
        freeDeliveryMin: _int(j['free_delivery_min'])!,
        freeDeliveryKm: (j['free_delivery_km'] as num).toDouble(),
        maxDeliveryKm: (j['max_delivery_km'] as num).toDouble(),
        deliveryFee: _int(j['delivery_fee'])!,
        cartLat: (j['cart_lat'] as num?)?.toDouble(),
        cartLng: (j['cart_lng'] as num?)?.toDouble(),
        notice: (j['notice'] ?? '') as String,
        upiId: (j['upi_id'] ?? '') as String,
        upiName: (j['upi_name'] ?? 'The Urban Bites') as String,
      );

  bool get hasUpi => upiId.isNotEmpty;

  int minFor(String fulfilment) => fulfilment == 'delivery' ? minOrderDelivery : minOrderPickup;

  /// Free within the radius once the order reaches the free-delivery amount. The distance is
  /// checked by the server when the customer shares a location.
  int feeFor(int subtotal) => subtotal >= freeDeliveryMin ? 0 : deliveryFee;
}

/// An offer of the day or of the month.
class Offer {
  final String id;
  final String period; // day or month
  final String title;
  final String description;
  final String? itemId;
  final String? itemName;
  final int? regularPrice;
  final int? offerPrice;
  final String startsOn;
  final String endsOn;
  final bool active;

  Offer({
    required this.id,
    required this.period,
    required this.title,
    required this.description,
    required this.itemId,
    required this.itemName,
    required this.regularPrice,
    required this.offerPrice,
    required this.startsOn,
    required this.endsOn,
    required this.active,
  });

  factory Offer.fromJson(Map<String, dynamic> j) => Offer(
        id: j['id'] as String,
        period: j['period'] as String,
        title: j['title'] as String,
        description: (j['description'] ?? '') as String,
        itemId: j['item_id'] as String?,
        itemName: j['item_name'] as String?,
        regularPrice: _int(j['regular_price']),
        offerPrice: _int(j['offer_price']),
        startsOn: j['starts_on'] as String,
        endsOn: j['ends_on'] as String,
        active: j['active'] as bool,
      );
}

/// Badge tiers, the same as the API's.
const badgeTiers = <(String, int)>[('First Bite', 1), ('Regular', 3), ('Gold Regular', 10), ('Urban Legend', 25)];

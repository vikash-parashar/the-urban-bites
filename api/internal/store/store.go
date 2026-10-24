// Package store is the Postgres data layer for menu, orders and earnings.
package store

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrations embed.FS

var uuidRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

var (
	ErrClosed       = errors.New("closed")
	ErrBelowMinimum = errors.New("below minimum order")
	ErrTooFar       = errors.New("outside delivery area")
	ErrNotFound     = errors.New("not found")
	ErrInvalid      = errors.New("invalid request")
	ErrUnavailable  = errors.New("item unavailable")
)

type Store struct {
	db *pgxpool.Pool
}

func Open(ctx context.Context, url string) (*Store, error) {
	db, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() { s.db.Close() }

// Migrate applies embedded migrations in filename order, once each.
func (s *Store) Migrate(ctx context.Context) error {
	if _, err := s.db.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return err
	}
	names, err := fs.Glob(migrations, "migrations/*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		var done bool
		if err := s.db.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, name).Scan(&done); err != nil {
			return err
		}
		if done {
			continue
		}
		sql, _ := migrations.ReadFile(name)
		err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return fmt.Errorf("%s: %w", name, err)
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name)
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}

// ---- Menu ----

type Category struct {
	ID     string     `json:"id"`
	Name   string     `json:"name"`
	NameHi string     `json:"name_hi"`
	Items  []MenuItem `json:"items"`
}

type MenuItem struct {
	ID         string `json:"id"`
	CategoryID string `json:"category_id"`
	Name       string `json:"name"`
	NameHi     string `json:"name_hi"`
	Full       *int   `json:"full"`
	Half       *int   `json:"half,omitempty"`
	Image      string `json:"image"`
	Available  bool   `json:"available"`
	OfferPrice *int   `json:"offer_price,omitempty"` // today's offer price for the full plate
}

// Menu returns every category with its items. Customers get only available items.
func (s *Store) Menu(ctx context.Context, includeUnavailable bool) ([]Category, error) {
	rows, err := s.db.Query(ctx, `
		SELECT c.id, c.name, c.name_hi, i.id, i.name, i.name_hi, i.price_full, i.price_half, i.image, i.available
		FROM categories c
		JOIN menu_items i ON i.category_id = c.id
		WHERE $1 OR i.available
		ORDER BY c.sort_order, i.sort_order`, includeUnavailable)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	offers, err := s.activeOfferPrices(ctx)
	if err != nil {
		return nil, err
	}
	var out []Category
	for rows.Next() {
		var c Category
		var it MenuItem
		if err := rows.Scan(&c.ID, &c.Name, &c.NameHi, &it.ID, &it.Name, &it.NameHi, &it.Full, &it.Half, &it.Image, &it.Available); err != nil {
			return nil, err
		}
		it.CategoryID = c.ID
		if p, ok := offers[it.ID]; ok && it.Full != nil {
			it.OfferPrice = &p
		}
		if n := len(out); n > 0 && out[n-1].ID == c.ID {
			out[n-1].Items = append(out[n-1].Items, it)
		} else {
			c.Items = []MenuItem{it}
			out = append(out, c)
		}
	}
	return out, rows.Err()
}

type ItemUpdate struct {
	Full      *int  `json:"full"`
	Half      *int  `json:"half"`
	Available *bool `json:"available"`
	ClearHalf bool  `json:"clear_half"`
}

func (s *Store) UpdateItem(ctx context.Context, id string, u ItemUpdate) error {
	tag, err := s.db.Exec(ctx, `
		UPDATE menu_items SET
			price_full = COALESCE($2, price_full),
			price_half = CASE WHEN $5 THEN NULL ELSE COALESCE($3, price_half) END,
			available  = COALESCE($4, available),
			updated_at = now()
		WHERE id = $1`, id, u.Full, u.Half, u.Available, u.ClearHalf)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SeedCategory upserts a category and its items (used by cmd/seed).
func (s *Store) SeedCategory(ctx context.Context, sortOrder int, c Category) error {
	return pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `
			INSERT INTO categories (id, name, name_hi, sort_order) VALUES ($1, $2, $3, $4)
			ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, name_hi = EXCLUDED.name_hi, sort_order = EXCLUDED.sort_order`,
			c.ID, c.Name, c.NameHi, sortOrder); err != nil {
			return err
		}
		for i, it := range c.Items {
			// Prices already set by the owner are kept; seeding only fills gaps.
			if _, err := tx.Exec(ctx, `
				INSERT INTO menu_items (id, category_id, name, name_hi, price_full, price_half, image, sort_order)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT (id) DO UPDATE SET
					category_id = EXCLUDED.category_id, name = EXCLUDED.name, name_hi = EXCLUDED.name_hi,
					image = EXCLUDED.image, sort_order = EXCLUDED.sort_order,
					price_full = COALESCE(menu_items.price_full, EXCLUDED.price_full),
					price_half = COALESCE(menu_items.price_half, EXCLUDED.price_half)`,
				it.ID, c.ID, it.Name, it.NameHi, it.Full, it.Half, it.Image, i); err != nil {
				return err
			}
		}
		return nil
	})
}

// ---- Orders ----

type Status string

const (
	StatusPlaced         Status = "placed"
	StatusAccepted       Status = "accepted"
	StatusPreparing      Status = "preparing"
	StatusReady          Status = "ready"
	StatusOutForDelivery Status = "out_for_delivery"
	StatusCompleted      Status = "completed"
	StatusCancelled      Status = "cancelled"
)

func (s Status) Valid() bool {
	switch s {
	case StatusPlaced, StatusAccepted, StatusPreparing, StatusReady, StatusOutForDelivery, StatusCompleted, StatusCancelled:
		return true
	}
	return false
}

type NewOrder struct {
	CustomerName  string         `json:"customer_name"`
	CustomerPhone string         `json:"customer_phone"`
	Fulfilment    string         `json:"fulfilment"`
	Address       string         `json:"address"`
	Note          string         `json:"note"`
	PaymentMethod string         `json:"payment_method"`
	Items         []NewOrderItem `json:"items"`
	// Optional customer location for the delivery distance check.
	Lat *float64 `json:"lat"`
	Lng *float64 `json:"lng"`
	// Set by the server: "web", "app" or "counter".
	Source string `json:"-"`
}

type NewOrderItem struct {
	ItemID string `json:"item_id"`
	Size   string `json:"size"`
	Qty    int    `json:"qty"`
}

type OrderLine struct {
	ItemID    string `json:"item_id"`
	Name      string `json:"name"`
	Size      string `json:"size"`
	UnitPrice int    `json:"unit_price"`
	Qty       int    `json:"qty"`
}

type Event struct {
	Status      Status    `json:"status"`
	PrepMinutes *int      `json:"prep_minutes,omitempty"`
	At          time.Time `json:"at"`
}

type Order struct {
	ID            string      `json:"id"`
	Number        int         `json:"number"`
	TrackToken    string      `json:"-"`
	CustomerName  string      `json:"customer_name"`
	CustomerPhone string      `json:"customer_phone"`
	Fulfilment    string      `json:"fulfilment"`
	Address       *string     `json:"address,omitempty"`
	Note          *string     `json:"note,omitempty"`
	Status        Status      `json:"status"`
	PaymentMethod string      `json:"payment_method"`
	PaymentStatus string      `json:"payment_status"`
	Source        string      `json:"source"`
	Subtotal      int         `json:"subtotal"`
	DeliveryFee   int         `json:"delivery_fee"`
	DeliveryKm    *float64    `json:"delivery_km"`
	Total         int         `json:"total"`
	PrepMinutes   *int        `json:"prep_minutes"`
	ReadyAt       *time.Time  `json:"ready_at"`
	CreatedAt     time.Time   `json:"created_at"`
	UpdatedAt     time.Time   `json:"updated_at"`
	Items         []OrderLine `json:"items"`
	Events        []Event     `json:"events,omitempty"`
	// Filled in for the owner's list: how many completed orders this phone has, and its badge.
	CustomerOrders int    `json:"customer_orders"`
	CustomerBadge  string `json:"customer_badge,omitempty"`
}

func newToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// CreateOrder prices every line from the database (offer prices included), never from the client,
// and applies the shop's minimum order and delivery rules.
func (s *Store) CreateOrder(ctx context.Context, in NewOrder) (*Order, error) {
	if len(in.Items) == 0 || len(in.Items) > 40 {
		return nil, fmt.Errorf("%w: order needs between 1 and 40 lines", ErrInvalid)
	}
	if in.Fulfilment != "pickup" && in.Fulfilment != "delivery" {
		return nil, fmt.Errorf("%w: fulfilment must be pickup or delivery", ErrInvalid)
	}
	if in.Fulfilment == "delivery" && in.Address == "" {
		return nil, fmt.Errorf("%w: delivery needs an address", ErrInvalid)
	}
	if in.PaymentMethod != "cash" && in.PaymentMethod != "online" {
		return nil, fmt.Errorf("%w: payment_method must be cash or online", ErrInvalid)
	}
	if in.Source == "" {
		in.Source = "web"
	}

	shop, err := s.Shop(ctx)
	if err != nil {
		return nil, err
	}
	if !shop.AcceptingOrders && in.Source != "counter" {
		return nil, fmt.Errorf("%w: We're not taking online orders right now. Call %s or visit the cart.", ErrClosed, "8398907216")
	}
	offerPrices, err := s.activeOfferPrices(ctx)
	if err != nil {
		return nil, err
	}

	var order *Order
	err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		lines := make([]OrderLine, 0, len(in.Items))
		subtotal := 0
		for _, it := range in.Items {
			if it.Qty < 1 || it.Qty > 50 || (it.Size != "full" && it.Size != "half") {
				return fmt.Errorf("%w: bad line for %q", ErrInvalid, it.ItemID)
			}
			var name string
			var full, half *int
			var available bool
			err := tx.QueryRow(ctx, `SELECT name, price_full, price_half, available FROM menu_items WHERE id = $1`, it.ItemID).
				Scan(&name, &full, &half, &available)
			if errors.Is(err, pgx.ErrNoRows) {
				return fmt.Errorf("%w: unknown item %q", ErrInvalid, it.ItemID)
			} else if err != nil {
				return err
			}
			price := full
			if it.Size == "half" {
				price = half
			} else if op, ok := offerPrices[it.ItemID]; ok {
				price = &op
				name += " (offer)"
			}
			if !available || price == nil {
				return fmt.Errorf("%w: %s", ErrUnavailable, name)
			}
			lines = append(lines, OrderLine{ItemID: it.ItemID, Name: name, Size: it.Size, UnitPrice: *price, Qty: it.Qty})
			subtotal += *price * it.Qty
		}

		fee := 0
		var km *float64
		if in.Source != "counter" {
			min := shop.MinOrderPickup
			if in.Fulfilment == "delivery" {
				min = shop.MinOrderDelivery
			}
			if subtotal < min {
				return fmt.Errorf("%w: The minimum for %s is ₹%d. Add ₹%d more.", ErrBelowMinimum, in.Fulfilment, min, min-subtotal)
			}
		}
		if in.Fulfilment == "delivery" {
			km, err = shop.DistanceKm(in.Lat, in.Lng)
			if err != nil {
				return err
			}
			if km != nil && *km > shop.MaxDeliveryKm {
				return fmt.Errorf("%w: You're about %.1f km away and we deliver within %g km. Choose pickup or call us.", ErrTooFar, *km, shop.MaxDeliveryKm)
			}
			fee = shop.DeliveryFeeFor(subtotal, km)
		}

		phone := strings.TrimSpace(in.CustomerPhone)
		o := &Order{Items: lines, TrackToken: newToken()}
		err := tx.QueryRow(ctx, `
			INSERT INTO orders (track_token, customer_name, customer_phone, phone_key, fulfilment, address, note, payment_method,
				source, subtotal, delivery_fee, delivery_km, total)
			VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9, $10, $11, $12, $13)
			RETURNING id, number, status, payment_status, created_at, updated_at`,
			o.TrackToken, in.CustomerName, phone, PhoneKey(phone), in.Fulfilment, in.Address, in.Note, in.PaymentMethod,
			in.Source, subtotal, fee, km, subtotal+fee).
			Scan(&o.ID, &o.Number, &o.Status, &o.PaymentStatus, &o.CreatedAt, &o.UpdatedAt)
		if err != nil {
			return err
		}
		for i, l := range lines {
			if _, err := tx.Exec(ctx, `INSERT INTO order_items (order_id, line, item_id, name, size, unit_price, qty) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				o.ID, i, l.ItemID, l.Name, l.Size, l.UnitPrice, l.Qty); err != nil {
				return err
			}
		}
		if _, err := tx.Exec(ctx, `INSERT INTO order_events (order_id, status) VALUES ($1, 'placed')`, o.ID); err != nil {
			return err
		}
		o.CustomerName, o.CustomerPhone, o.Fulfilment, o.PaymentMethod = in.CustomerName, phone, in.Fulfilment, in.PaymentMethod
		o.Source, o.Subtotal, o.DeliveryFee, o.DeliveryKm, o.Total = in.Source, subtotal, fee, km, subtotal+fee
		order = o
		return nil
	})
	return order, err
}

const orderCols = `id, number, track_token, customer_name, COALESCE(customer_phone, ''), fulfilment, address, note, status,
	payment_method, payment_status, source, subtotal, delivery_fee, delivery_km::float8, total, prep_minutes, ready_at, created_at, updated_at`

func scanOrder(row pgx.Row) (*Order, error) {
	var o Order
	err := row.Scan(&o.ID, &o.Number, &o.TrackToken, &o.CustomerName, &o.CustomerPhone, &o.Fulfilment, &o.Address, &o.Note,
		&o.Status, &o.PaymentMethod, &o.PaymentStatus, &o.Source, &o.Subtotal, &o.DeliveryFee, &o.DeliveryKm, &o.Total,
		&o.PrepMinutes, &o.ReadyAt, &o.CreatedAt, &o.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &o, err
}

func (s *Store) loadLines(ctx context.Context, orders []*Order) error {
	if len(orders) == 0 {
		return nil
	}
	ids := make([]string, len(orders))
	byID := make(map[string]*Order, len(orders))
	for i, o := range orders {
		ids[i] = o.ID
		byID[o.ID] = o
		o.Items = []OrderLine{}
	}
	rows, err := s.db.Query(ctx, `SELECT order_id, item_id, name, size, unit_price, qty FROM order_items WHERE order_id = ANY($1::uuid[]) ORDER BY order_id, line`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var l OrderLine
		if err := rows.Scan(&id, &l.ItemID, &l.Name, &l.Size, &l.UnitPrice, &l.Qty); err != nil {
			return err
		}
		byID[id].Items = append(byID[id].Items, l)
	}
	return rows.Err()
}

func (s *Store) loadEvents(ctx context.Context, o *Order) error {
	rows, err := s.db.Query(ctx, `SELECT status, prep_minutes, at FROM order_events WHERE order_id = $1 ORDER BY at, id`, o.ID)
	if err != nil {
		return err
	}
	defer rows.Close()
	o.Events = []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.Status, &e.PrepMinutes, &e.At); err != nil {
			return err
		}
		o.Events = append(o.Events, e)
	}
	return rows.Err()
}

// Order returns one order with lines and timeline.
func (s *Store) Order(ctx context.Context, id string) (*Order, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	o, err := scanOrder(s.db.QueryRow(ctx, `SELECT `+orderCols+` FROM orders WHERE id = $1`, id))
	if err != nil {
		return nil, err
	}
	if err := s.loadLines(ctx, []*Order{o}); err != nil {
		return nil, err
	}
	return o, s.loadEvents(ctx, o)
}

// Orders lists orders for the owner, newest first. active=true hides completed and cancelled.
func (s *Store) Orders(ctx context.Context, active bool, since time.Time, limit int) ([]*Order, error) {
	rows, err := s.db.Query(ctx, `SELECT `+orderCols+` FROM orders
		WHERE (NOT $1 OR status NOT IN ('completed', 'cancelled')) AND created_at >= $2
		ORDER BY created_at DESC LIMIT $3`, active, since, limit)
	if err != nil {
		return nil, err
	}
	var out []*Order
	for rows.Next() {
		o, err := scanOrder(rows)
		if err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, o)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if out == nil {
		out = []*Order{}
	}
	return out, s.loadLines(ctx, out)
}

type OrderUpdate struct {
	Status        *Status `json:"status"`
	PrepMinutes   *int    `json:"prep_minutes"`
	PaymentStatus *string `json:"payment_status"`
}

// UpdateOrder lets the owner move an order along and set how long it will take.
// Setting prep_minutes stamps ready_at = now + prep_minutes, which the customer sees as a countdown.
func (s *Store) UpdateOrder(ctx context.Context, id string, u OrderUpdate) (*Order, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	if u.Status != nil && !u.Status.Valid() {
		return nil, fmt.Errorf("%w: unknown status %q", ErrInvalid, *u.Status)
	}
	if u.PrepMinutes != nil && (*u.PrepMinutes < 1 || *u.PrepMinutes > 240) {
		return nil, fmt.Errorf("%w: prep_minutes must be 1 to 240", ErrInvalid)
	}
	if u.PaymentStatus != nil && *u.PaymentStatus != "pending" && *u.PaymentStatus != "paid" && *u.PaymentStatus != "refunded" {
		return nil, fmt.Errorf("%w: bad payment_status", ErrInvalid)
	}
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var status Status
		err := tx.QueryRow(ctx, `
			UPDATE orders SET
				status = COALESCE($2::order_status, status),
				prep_minutes = COALESCE($3, prep_minutes),
				ready_at = CASE WHEN $3::int IS NOT NULL THEN now() + make_interval(mins => $3::int) ELSE ready_at END,
				payment_status = COALESCE($4::payment_status, payment_status),
				updated_at = now()
			WHERE id = $1
			RETURNING status`, id, u.Status, u.PrepMinutes, u.PaymentStatus).Scan(&status)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if u.Status != nil || u.PrepMinutes != nil {
			_, err = tx.Exec(ctx, `INSERT INTO order_events (order_id, status, prep_minutes) VALUES ($1, $2, $3)`, id, status, u.PrepMinutes)
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.Order(ctx, id)
}

// ---- Earnings ----

type DayEarnings struct {
	Day       string `json:"day"`
	Orders    int    `json:"orders"`
	Revenue   int    `json:"revenue"`
	Cash      int    `json:"cash"`
	Online    int    `json:"online"`
	Cancelled int    `json:"cancelled"`
}

type TopItem struct {
	ItemID string `json:"item_id"`
	Name   string `json:"name"`
	Qty    int    `json:"qty"`
	Sales  int    `json:"sales"`
}

type Earnings struct {
	From     string        `json:"from"`
	To       string        `json:"to"`
	Revenue  int           `json:"revenue"`
	Orders   int           `json:"orders"`
	AvgOrder int           `json:"avg_order"`
	Days     []DayEarnings `json:"days"`
	TopItems []TopItem     `json:"top_items"`
}

// Earnings totals completed orders per day in IST between from and to (inclusive dates).
func (s *Store) Earnings(ctx context.Context, from, to time.Time) (*Earnings, error) {
	e := &Earnings{From: from.Format("2006-01-02"), To: to.Format("2006-01-02"), Days: []DayEarnings{}, TopItems: []TopItem{}}
	end := to.AddDate(0, 0, 1)
	rows, err := s.db.Query(ctx, `
		SELECT to_char(created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
			count(*) FILTER (WHERE status = 'completed'),
			COALESCE(sum(total) FILTER (WHERE status = 'completed'), 0),
			COALESCE(sum(total) FILTER (WHERE status = 'completed' AND payment_method = 'cash'), 0),
			COALESCE(sum(total) FILTER (WHERE status = 'completed' AND payment_method = 'online'), 0),
			count(*) FILTER (WHERE status = 'cancelled')
		FROM orders WHERE created_at >= $1 AND created_at < $2
		GROUP BY day ORDER BY day`, from, end)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var d DayEarnings
		if err := rows.Scan(&d.Day, &d.Orders, &d.Revenue, &d.Cash, &d.Online, &d.Cancelled); err != nil {
			rows.Close()
			return nil, err
		}
		e.Days = append(e.Days, d)
		e.Revenue += d.Revenue
		e.Orders += d.Orders
	}
	rows.Close()
	if e.Orders > 0 {
		e.AvgOrder = e.Revenue / e.Orders
	}
	rows, err = s.db.Query(ctx, `
		SELECT oi.item_id, min(oi.name), sum(oi.qty), sum(oi.qty * oi.unit_price)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id
		WHERE o.status = 'completed' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY oi.item_id ORDER BY 4 DESC LIMIT 10`, from, end)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var t TopItem
		if err := rows.Scan(&t.ItemID, &t.Name, &t.Qty, &t.Sales); err != nil {
			return nil, err
		}
		e.TopItems = append(e.TopItems, t)
	}
	return e, rows.Err()
}

package store

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var nonDigit = regexp.MustCompile(`\D`)

// PhoneKey is the last 10 digits, so "+91 98765 43210" and "9876543210" count as one customer.
func PhoneKey(phone string) string {
	d := nonDigit.ReplaceAllString(phone, "")
	if len(d) < 10 {
		return ""
	}
	return d[len(d)-10:]
}

// Badge tiers by completed orders, counting website, app and walk-in (counter) orders with a phone number.
type Tier struct {
	Name string `json:"name"`
	Min  int    `json:"min"`
}

var Tiers = []Tier{
	{"First Bite", 1},
	{"Regular", 3},
	{"Gold Regular", 10},
	{"Urban Legend", 25},
}

// MonthlyTopMin is how many orders this month it takes to be eligible for "Foodie of the Month".
const MonthlyTopMin = 3

type Badge struct {
	Orders      int     `json:"orders"`
	Badge       *string `json:"badge"`
	NextBadge   *string `json:"next_badge"`
	ToNext      int     `json:"to_next"`
	MonthOrders int     `json:"month_orders"`
	TopOfMonth  bool    `json:"top_of_month"`
}

func badgeFor(n int) (cur, next *Tier) {
	for i := range Tiers {
		if n >= Tiers[i].Min {
			cur = &Tiers[i]
		} else if next == nil {
			next = &Tiers[i]
		}
	}
	return cur, next
}

func monthStart() time.Time {
	n := time.Now().In(IST)
	return time.Date(n.Year(), n.Month(), 1, 0, 0, 0, 0, IST)
}

func (s *Store) CustomerBadge(ctx context.Context, phone string) (*Badge, error) {
	key := PhoneKey(phone)
	if key == "" {
		return nil, fmt.Errorf("%w: enter a 10-digit phone number", ErrInvalid)
	}
	b := &Badge{}
	err := s.db.QueryRow(ctx, `
		SELECT count(*), count(*) FILTER (WHERE created_at >= $2)
		FROM orders WHERE phone_key = $1 AND status = 'completed'`, key, monthStart()).Scan(&b.Orders, &b.MonthOrders)
	if err != nil {
		return nil, err
	}
	cur, next := badgeFor(b.Orders)
	if cur != nil {
		b.Badge = &cur.Name
	}
	if next != nil {
		b.NextBadge = &next.Name
		b.ToNext = next.Min - b.Orders
	}
	top, err := s.Leaderboard(ctx, 1)
	if err != nil {
		return nil, err
	}
	b.TopOfMonth = len(top) > 0 && top[0].key == key
	return b, nil
}

type Regular struct {
	Name        string `json:"name"`
	PhoneHint   string `json:"phone_hint"`
	MonthOrders int    `json:"month_orders"`
	Badge       string `json:"badge"`
	key         string
}

// Leaderboard ranks this month's customers by completed orders. Only a first name and the last
// two digits are shown publicly.
func (s *Store) Leaderboard(ctx context.Context, limit int) ([]Regular, error) {
	rows, err := s.db.Query(ctx, `
		WITH month AS (
			SELECT phone_key, count(*) AS n, max(created_at) AS last
			FROM orders WHERE status = 'completed' AND phone_key IS NOT NULL AND created_at >= $1
			GROUP BY phone_key HAVING count(*) >= $2
		)
		SELECT m.phone_key, m.n,
			(SELECT count(*) FROM orders a WHERE a.phone_key = m.phone_key AND a.status = 'completed'),
			(SELECT customer_name FROM orders b WHERE b.phone_key = m.phone_key ORDER BY created_at DESC LIMIT 1)
		FROM month m ORDER BY m.n DESC, m.last ASC LIMIT $3`, monthStart(), MonthlyTopMin, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Regular{}
	for rows.Next() {
		var r Regular
		var lifetime int
		if err := rows.Scan(&r.key, &r.MonthOrders, &lifetime, &r.Name); err != nil {
			return nil, err
		}
		r.Name = firstName(r.Name)
		r.PhoneHint = "••" + r.key[len(r.key)-2:]
		if cur, _ := badgeFor(lifetime); cur != nil {
			r.Badge = cur.Name
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func firstName(n string) string {
	f := strings.Fields(n)
	if len(f) == 0 {
		return "Guest"
	}
	if len(f[0]) > 16 {
		return f[0][:16]
	}
	return f[0]
}

// OrderCounts returns completed-order counts per phone key, for badges on the owner's order list.
func (s *Store) OrderCounts(ctx context.Context, keys []string) (map[string]int, error) {
	out := map[string]int{}
	if len(keys) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `SELECT phone_key, count(*) FROM orders WHERE phone_key = ANY($1) AND status = 'completed' GROUP BY phone_key`, keys)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

// BadgeName is the tier name for a count, or "" for none.
func BadgeName(n int) string {
	if cur, _ := badgeFor(n); cur != nil {
		return cur.Name
	}
	return ""
}

type CounterSale struct {
	CustomerName  string         `json:"customer_name"`
	CustomerPhone string         `json:"customer_phone"`
	PaymentMethod string         `json:"payment_method"`
	Items         []NewOrderItem `json:"items"`
	Amount        int            `json:"amount"` // used when no items are listed
}

// CreateCounterSale records a walk-in sale as a completed, paid order, so it counts in earnings and badges.
func (s *Store) CreateCounterSale(ctx context.Context, in CounterSale) (*Order, error) {
	if in.PaymentMethod == "" {
		in.PaymentMethod = "cash"
	}
	if strings.TrimSpace(in.CustomerName) == "" {
		in.CustomerName = "Walk-in"
	}
	var o *Order
	var err error
	if len(in.Items) > 0 {
		o, err = s.CreateOrder(ctx, NewOrder{
			CustomerName: in.CustomerName, CustomerPhone: in.CustomerPhone, Fulfilment: "pickup",
			PaymentMethod: in.PaymentMethod, Items: in.Items, Source: "counter",
		})
		if err != nil {
			return nil, err
		}
	} else {
		if in.Amount <= 0 || in.Amount > 100000 {
			return nil, fmt.Errorf("%w: add items or an amount", ErrInvalid)
		}
		if in.PaymentMethod != "cash" && in.PaymentMethod != "online" {
			return nil, fmt.Errorf("%w: payment_method must be cash or online", ErrInvalid)
		}
		var id string
		phone := strings.TrimSpace(in.CustomerPhone)
		err = pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
			if err := tx.QueryRow(ctx, `
				INSERT INTO orders (track_token, customer_name, customer_phone, phone_key, fulfilment, payment_method, source, subtotal, total)
				VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), 'pickup', $5, 'counter', $6, $6) RETURNING id`,
				newToken(), in.CustomerName, phone, PhoneKey(phone), in.PaymentMethod, in.Amount).Scan(&id); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO order_events (order_id, status) VALUES ($1, 'placed')`, id)
			return err
		})
		if err != nil {
			return nil, err
		}
		o = &Order{ID: id}
	}
	done, paid := StatusCompleted, "paid"
	return s.UpdateOrder(ctx, o.ID, OrderUpdate{Status: &done, PaymentStatus: &paid})
}

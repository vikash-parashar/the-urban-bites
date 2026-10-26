package store

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// ---- Owner dashboard: sales, cost, profit and what sells ----
//
// Money counts completed orders only. Cost uses the cost price saved on each line when it was sold; lines
// sold before a cost was set fall back to the item's current cost, and lines with no cost at all are
// reported as UncostedSales so the owner knows the profit figure is missing something.

var istLoc = time.FixedZone("IST", 5*60*60+30*60)

type Totals struct {
	Orders        int `json:"orders"`
	Revenue       int `json:"revenue"`
	Cost          int `json:"cost"`
	GrossProfit   int `json:"gross_profit"`
	Expenses      int `json:"expenses"`
	NetProfit     int `json:"net_profit"`
	AvgOrder      int `json:"avg_order"`
	Cancelled     int `json:"cancelled"`
	ItemsSold     int `json:"items_sold"`
	UncostedSales int `json:"uncosted_sales"`
	Customers     int `json:"customers"`
	NewCustomers  int `json:"new_customers"`
}

type Bucket struct {
	Key      string `json:"key"`   // 2026-10-26, 2026-10, or 14 (hour)
	Label    string `json:"label"` // short label for the chart
	Orders   int    `json:"orders"`
	Revenue  int    `json:"revenue"`
	Cost     int    `json:"cost"`
	Expenses int    `json:"expenses"`
	Profit   int    `json:"profit"` // revenue - cost - expenses
}

type ItemStat struct {
	ItemID  string `json:"item_id"`
	Name    string `json:"name"`
	Qty     int    `json:"qty"`
	Sales   int    `json:"sales"`
	Cost    int    `json:"cost"`
	Profit  int    `json:"profit"`
	Costed  bool   `json:"costed"`
	Margin  int    `json:"margin"` // profit as % of sales, when costed
	Orders  int    `json:"orders"`
	Picture string `json:"image"`
}

type Split struct {
	Key     string `json:"key"`
	Orders  int    `json:"orders"`
	Revenue int    `json:"revenue"`
}

type CustomerStat struct {
	Name   string `json:"name"`
	Phone  string `json:"phone"` // last 4 digits only
	Orders int    `json:"orders"`
	Spent  int    `json:"spent"`
}

type Dashboard struct {
	Period       string         `json:"period"`
	From         string         `json:"from"`
	To           string         `json:"to"`
	Bucket       string         `json:"bucket"`
	Totals       Totals         `json:"totals"`
	Previous     Totals         `json:"previous"` // the same length of time just before, for "up 12%"
	Series       []Bucket       `json:"series"`
	TopItems     []ItemStat     `json:"top_items"`
	SlowItems    []ItemStat     `json:"slow_items"` // on the menu but sold least
	Hours        [24]int        `json:"hours"`      // orders by hour of day (IST)
	Weekdays     [7]int         `json:"weekdays"`   // orders by weekday, Monday first
	Sources      []Split        `json:"sources"`
	Payments     []Split        `json:"payments"`
	Fulfilment   []Split        `json:"fulfilment"`
	TopCustomers []CustomerStat `json:"top_customers"`
	ExpenseCats  []Split        `json:"expense_categories"`
	MissingCost  int            `json:"missing_cost"` // menu items with no cost price yet
}

// lineCost is the cost of one order line: its saved cost, else the item's current cost for that size.
const lineCost = `COALESCE(oi.unit_cost, CASE WHEN oi.size = 'half' THEN m.cost_half ELSE m.cost_full END)`

// DashboardFor builds the dashboard for IST dates from..to (inclusive). bucket is hour, day or month.
func (s *Store) DashboardFor(ctx context.Context, period string, from, to time.Time, bucket string) (*Dashboard, error) {
	d := &Dashboard{Period: period, From: from.Format("2006-01-02"), To: to.Format("2006-01-02"), Bucket: bucket,
		Series: []Bucket{}, TopItems: []ItemStat{}, SlowItems: []ItemStat{}, Sources: []Split{}, Payments: []Split{},
		Fulfilment: []Split{}, TopCustomers: []CustomerStat{}, ExpenseCats: []Split{}}
	end := to.AddDate(0, 0, 1)

	var err error
	if d.Totals, err = s.totals(ctx, from, end); err != nil {
		return nil, err
	}
	days := int(end.Sub(from).Hours()/24 + 0.5)
	if d.Previous, err = s.totals(ctx, from.AddDate(0, 0, -days), from); err != nil {
		return nil, err
	}
	if err := s.series(ctx, d, from, end, bucket); err != nil {
		return nil, err
	}
	if err := s.itemStats(ctx, d, from, end); err != nil {
		return nil, err
	}
	if err := s.patterns(ctx, d, from, end); err != nil {
		return nil, err
	}
	err = s.db.QueryRow(ctx, `SELECT count(*) FROM menu_items WHERE deleted_at IS NULL AND cost_full IS NULL AND price_full IS NOT NULL`).
		Scan(&d.MissingCost)
	return d, err
}

func (s *Store) totals(ctx context.Context, from, end time.Time) (Totals, error) {
	var t Totals
	err := s.db.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE status = 'completed'),
			COALESCE(sum(total) FILTER (WHERE status = 'completed'), 0),
			count(*) FILTER (WHERE status = 'cancelled'),
			count(DISTINCT phone_key) FILTER (WHERE status = 'completed' AND phone_key IS NOT NULL)
		FROM orders WHERE created_at >= $1 AND created_at < $2`, from, end).
		Scan(&t.Orders, &t.Revenue, &t.Cancelled, &t.Customers)
	if err != nil {
		return t, err
	}
	err = s.db.QueryRow(ctx, `
		SELECT COALESCE(sum(oi.qty), 0),
			COALESCE(sum(oi.qty * `+lineCost+`), 0),
			COALESCE(sum(oi.qty * oi.unit_price) FILTER (WHERE `+lineCost+` IS NULL), 0)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN menu_items m ON m.id = oi.item_id
		WHERE o.status = 'completed' AND o.created_at >= $1 AND o.created_at < $2`, from, end).
		Scan(&t.ItemsSold, &t.Cost, &t.UncostedSales)
	if err != nil {
		return t, err
	}
	err = s.db.QueryRow(ctx, `SELECT COALESCE(sum(amount), 0) FROM expenses WHERE spent_on >= $1::date AND spent_on < $2::date`,
		from.Format("2006-01-02"), end.Format("2006-01-02")).Scan(&t.Expenses)
	if err != nil {
		return t, err
	}
	// New customers: their first completed order ever falls in this period.
	err = s.db.QueryRow(ctx, `
		SELECT count(*) FROM (
			SELECT phone_key, min(created_at) AS first FROM orders
			WHERE status = 'completed' AND phone_key IS NOT NULL GROUP BY phone_key
		) f WHERE f.first >= $1 AND f.first < $2`, from, end).Scan(&t.NewCustomers)
	if err != nil {
		return t, err
	}
	t.GrossProfit = t.Revenue - t.Cost
	t.NetProfit = t.GrossProfit - t.Expenses
	if t.Orders > 0 {
		t.AvgOrder = t.Revenue / t.Orders
	}
	return t, nil
}

func (s *Store) series(ctx context.Context, d *Dashboard, from, end time.Time, bucket string) error {
	var keyExpr, dayKey string
	switch bucket {
	case "hour":
		keyExpr = `to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'HH24')`
	case "month":
		keyExpr = `to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM')`
		dayKey = `to_char(spent_on, 'YYYY-MM')`
	default:
		keyExpr = `to_char(o.created_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`
		dayKey = `to_char(spent_on, 'YYYY-MM-DD')`
	}
	// Every bucket in the range, so the chart has no gaps.
	idx := map[string]int{}
	add := func(key, label string) {
		idx[key] = len(d.Series)
		d.Series = append(d.Series, Bucket{Key: key, Label: label})
	}
	switch bucket {
	case "hour":
		for h := 0; h < 24; h++ {
			add(fmt.Sprintf("%02d", h), hourLabel(h))
		}
	case "month":
		for m := time.Date(from.Year(), from.Month(), 1, 0, 0, 0, 0, istLoc); m.Before(end); m = m.AddDate(0, 1, 0) {
			add(m.Format("2006-01"), m.Format("Jan"))
		}
	default:
		for day := from; day.Before(end); day = day.AddDate(0, 0, 1) {
			label := day.Format("2")
			if end.Sub(from) <= 8*24*time.Hour {
				label = day.Format("Mon")
			}
			add(day.Format("2006-01-02"), label)
		}
	}

	rows, err := s.db.Query(ctx, `
		SELECT `+keyExpr+` AS k, count(*), COALESCE(sum(o.total), 0)
		FROM orders o WHERE o.status = 'completed' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY k`, from, end)
	if err != nil {
		return err
	}
	for rows.Next() {
		var k string
		var n, rev int
		if err := rows.Scan(&k, &n, &rev); err != nil {
			rows.Close()
			return err
		}
		if i, ok := idx[k]; ok {
			d.Series[i].Orders, d.Series[i].Revenue = n, rev
		}
	}
	rows.Close()

	rows, err = s.db.Query(ctx, `
		SELECT `+keyExpr+` AS k, COALESCE(sum(oi.qty * `+lineCost+`), 0)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN menu_items m ON m.id = oi.item_id
		WHERE o.status = 'completed' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY k`, from, end)
	if err != nil {
		return err
	}
	for rows.Next() {
		var k string
		var c int
		if err := rows.Scan(&k, &c); err != nil {
			rows.Close()
			return err
		}
		if i, ok := idx[k]; ok {
			d.Series[i].Cost = c
		}
	}
	rows.Close()

	if dayKey != "" {
		rows, err = s.db.Query(ctx, `
			SELECT `+dayKey+` AS k, sum(amount) FROM expenses
			WHERE spent_on >= $1::date AND spent_on < $2::date GROUP BY k`, from.Format("2006-01-02"), end.Format("2006-01-02"))
		if err != nil {
			return err
		}
		for rows.Next() {
			var k string
			var a int
			if err := rows.Scan(&k, &a); err != nil {
				rows.Close()
				return err
			}
			if i, ok := idx[k]; ok {
				d.Series[i].Expenses = a
			}
		}
		rows.Close()
	}
	for i := range d.Series {
		b := &d.Series[i]
		b.Profit = b.Revenue - b.Cost - b.Expenses
	}
	return nil
}

func hourLabel(h int) string {
	switch {
	case h == 0:
		return "12a"
	case h < 12:
		return fmt.Sprintf("%da", h)
	case h == 12:
		return "12p"
	default:
		return fmt.Sprintf("%dp", h-12)
	}
}

func (s *Store) itemStats(ctx context.Context, d *Dashboard, from, end time.Time) error {
	rows, err := s.db.Query(ctx, `
		SELECT oi.item_id, COALESCE(min(m.name), min(oi.name)), COALESCE(min(m.image), ''),
			sum(oi.qty), sum(oi.qty * oi.unit_price), COALESCE(sum(oi.qty * `+lineCost+`), 0),
			bool_and(`+lineCost+` IS NOT NULL), count(DISTINCT oi.order_id)
		FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN menu_items m ON m.id = oi.item_id
		WHERE o.status = 'completed' AND o.created_at >= $1 AND o.created_at < $2
		GROUP BY oi.item_id ORDER BY 4 DESC, 5 DESC LIMIT 10`, from, end)
	if err != nil {
		return err
	}
	for rows.Next() {
		var it ItemStat
		if err := rows.Scan(&it.ItemID, &it.Name, &it.Picture, &it.Qty, &it.Sales, &it.Cost, &it.Costed, &it.Orders); err != nil {
			rows.Close()
			return err
		}
		it.Profit = it.Sales - it.Cost
		if it.Costed && it.Sales > 0 {
			it.Margin = it.Profit * 100 / it.Sales
		}
		d.TopItems = append(d.TopItems, it)
	}
	rows.Close()

	// Slow movers: dishes on the menu that sold the least (including not at all) in this period.
	rows, err = s.db.Query(ctx, `
		SELECT m.id, m.name, m.image, COALESCE(sum(oi.qty), 0) AS q, COALESCE(sum(oi.qty * oi.unit_price), 0)
		FROM menu_items m
		LEFT JOIN order_items oi ON oi.item_id = m.id
			AND oi.order_id IN (SELECT id FROM orders WHERE status = 'completed' AND created_at >= $1 AND created_at < $2)
		WHERE m.deleted_at IS NULL AND m.available AND m.price_full IS NOT NULL
		GROUP BY m.id ORDER BY q, m.name LIMIT 5`, from, end)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var it ItemStat
		if err := rows.Scan(&it.ItemID, &it.Name, &it.Picture, &it.Qty, &it.Sales); err != nil {
			return err
		}
		d.SlowItems = append(d.SlowItems, it)
	}
	return rows.Err()
}

func (s *Store) patterns(ctx context.Context, d *Dashboard, from, end time.Time) error {
	rows, err := s.db.Query(ctx, `
		SELECT extract(hour FROM created_at AT TIME ZONE 'Asia/Kolkata')::int,
			extract(isodow FROM created_at AT TIME ZONE 'Asia/Kolkata')::int, count(*)
		FROM orders WHERE status = 'completed' AND created_at >= $1 AND created_at < $2
		GROUP BY 1, 2`, from, end)
	if err != nil {
		return err
	}
	for rows.Next() {
		var h, dow, n int
		if err := rows.Scan(&h, &dow, &n); err != nil {
			rows.Close()
			return err
		}
		d.Hours[h] += n
		d.Weekdays[dow-1] += n
	}
	rows.Close()

	split := func(col string) ([]Split, error) {
		rows, err := s.db.Query(ctx, `SELECT `+col+`::text, count(*), COALESCE(sum(total), 0) FROM orders
			WHERE status = 'completed' AND created_at >= $1 AND created_at < $2 GROUP BY 1 ORDER BY 3 DESC`, from, end)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		out := []Split{}
		for rows.Next() {
			var sp Split
			if err := rows.Scan(&sp.Key, &sp.Orders, &sp.Revenue); err != nil {
				return nil, err
			}
			out = append(out, sp)
		}
		return out, rows.Err()
	}
	if d.Sources, err = split("source"); err != nil {
		return err
	}
	if d.Payments, err = split("payment_method"); err != nil {
		return err
	}
	if d.Fulfilment, err = split("fulfilment"); err != nil {
		return err
	}

	rows, err = s.db.Query(ctx, `
		SELECT (array_agg(customer_name ORDER BY created_at DESC))[1], min(customer_phone), count(*), sum(total)
		FROM orders WHERE status = 'completed' AND phone_key IS NOT NULL AND created_at >= $1 AND created_at < $2
		GROUP BY phone_key ORDER BY 3 DESC, 4 DESC LIMIT 5`, from, end)
	if err != nil {
		return err
	}
	for rows.Next() {
		var c CustomerStat
		if err := rows.Scan(&c.Name, &c.Phone, &c.Orders, &c.Spent); err != nil {
			rows.Close()
			return err
		}
		if n := len(c.Phone); n > 4 {
			c.Phone = "••" + c.Phone[n-4:]
		}
		d.TopCustomers = append(d.TopCustomers, c)
	}
	rows.Close()

	rows, err = s.db.Query(ctx, `SELECT category, count(*), sum(amount) FROM expenses
		WHERE spent_on >= $1::date AND spent_on < $2::date GROUP BY 1 ORDER BY 3 DESC`,
		from.Format("2006-01-02"), end.Format("2006-01-02"))
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var sp Split
		if err := rows.Scan(&sp.Key, &sp.Orders, &sp.Revenue); err != nil {
			return err
		}
		d.ExpenseCats = append(d.ExpenseCats, sp)
	}
	return rows.Err()
}

// ---- Expenses ----

type Expense struct {
	ID       string    `json:"id"`
	SpentOn  string    `json:"spent_on"`
	Category string    `json:"category"`
	Amount   int       `json:"amount"`
	Note     string    `json:"note"`
	AddedAt  time.Time `json:"created_at"`
}

// ExpenseCategories are suggestions in the form; any short label is accepted.
var ExpenseCategories = []string{"Vegetables & groceries", "Paneer & dairy", "Gas", "Packing", "Staff", "Rent & electricity", "Repairs", "Other"}

func (s *Store) Expenses(ctx context.Context, from, to time.Time) ([]Expense, error) {
	rows, err := s.db.Query(ctx, `SELECT id, to_char(spent_on, 'YYYY-MM-DD'), category, amount, note, created_at FROM expenses
		WHERE spent_on BETWEEN $1::date AND $2::date ORDER BY spent_on DESC, created_at DESC LIMIT 500`,
		from.Format("2006-01-02"), to.Format("2006-01-02"))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Expense{}
	for rows.Next() {
		var e Expense
		if err := rows.Scan(&e.ID, &e.SpentOn, &e.Category, &e.Amount, &e.Note, &e.AddedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) AddExpense(ctx context.Context, by string, e Expense) (*Expense, error) {
	e.Category, e.Note = strings.TrimSpace(e.Category), strings.TrimSpace(e.Note)
	day, err := time.ParseInLocation("2006-01-02", e.SpentOn, istLoc)
	if err != nil {
		return nil, fmt.Errorf("%w: date must be YYYY-MM-DD", ErrInvalid)
	}
	if day.After(time.Now().In(istLoc)) {
		return nil, fmt.Errorf("%w: the date can't be in the future", ErrInvalid)
	}
	if e.Category == "" || len([]rune(e.Category)) > 40 || len([]rune(e.Note)) > 140 {
		return nil, fmt.Errorf("%w: pick a category (up to 40 characters); the note can be up to 140", ErrInvalid)
	}
	if e.Amount <= 0 || e.Amount > 10000000 {
		return nil, fmt.Errorf("%w: amount must be between ₹1 and ₹1,00,00,000", ErrInvalid)
	}
	var createdBy *string
	if uuidRe.MatchString(by) {
		createdBy = &by
	}
	err = s.db.QueryRow(ctx, `INSERT INTO expenses (spent_on, category, amount, note, created_by) VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at`, e.SpentOn, e.Category, e.Amount, e.Note, createdBy).Scan(&e.ID, &e.AddedAt)
	return &e, err
}

func (s *Store) DeleteExpense(ctx context.Context, id string) error {
	if !uuidRe.MatchString(id) {
		return ErrNotFound
	}
	tag, err := s.db.Exec(ctx, `DELETE FROM expenses WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

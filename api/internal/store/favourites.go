package store

import (
	"context"
	"crypto/subtle"
	"sort"
)

// FavItem is one dish in a customer's suggested combo.
type FavItem struct {
	ItemID string `json:"item_id"`
	Name   string `json:"name"`
	Size   string `json:"size"`
	Qty    int    `json:"qty"`
	Times  int    `json:"times"` // how many of their orders had it
}

type Favourites struct {
	Orders int       `json:"orders"`
	Items  []FavItem `json:"items"`
}

// FavouritesFor builds a "you love these" combo from every finished order (website, app and
// walk-in) placed with the same phone number as this order. A dish makes the combo when it was
// in at least two orders (or in their only order), at the quantity they usually take.
// Dishes that are sold out or removed are left out, and so is anything without a price.
func (s *Store) FavouritesFor(ctx context.Context, orderID, token string) (*Favourites, error) {
	var key *string
	var want string
	if err := s.db.QueryRow(ctx, `SELECT phone_key, track_token FROM orders WHERE id::text = $1`, orderID).Scan(&key, &want); err != nil {
		return nil, ErrNotFound
	}
	if subtle.ConstantTimeCompare([]byte(token), []byte(want)) != 1 {
		return nil, ErrNotFound
	}
	out := &Favourites{Items: []FavItem{}}
	if key == nil || *key == "" {
		return out, nil
	}
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM orders WHERE phone_key = $1 AND status <> 'cancelled'`, *key).Scan(&out.Orders); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, `
		SELECT oi.item_id, m.name, oi.size, count(DISTINCT o.id) AS times,
		       percentile_disc(0.5) WITHIN GROUP (ORDER BY oi.qty) AS usual,
		       extract(epoch FROM max(o.created_at))::bigint AS last
		FROM orders o
		JOIN order_items oi ON oi.order_id = o.id
		JOIN menu_items m ON m.id = oi.item_id
		WHERE o.phone_key = $1 AND o.status <> 'cancelled'
		  AND m.available AND m.deleted_at IS NULL
		  AND ((oi.size = 'full' AND m.price_full IS NOT NULL) OR (oi.size = 'half' AND m.price_half IS NOT NULL))
		GROUP BY oi.item_id, m.name, oi.size`, *key)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	type row struct {
		FavItem
		last int64
	}
	var all []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.ItemID, &r.Name, &r.Size, &r.Times, &r.Qty, &r.last); err != nil {
			return nil, err
		}
		all = append(all, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	min := 2
	if out.Orders <= 1 {
		min = 1
	}
	sort.Slice(all, func(i, j int) bool {
		if all[i].Times != all[j].Times {
			return all[i].Times > all[j].Times
		}
		return all[i].last > all[j].last
	})
	seen := map[string]bool{}
	for _, r := range all {
		if r.Times < min || seen[r.ItemID] || len(out.Items) == 4 {
			continue
		}
		seen[r.ItemID] = true
		if r.Qty < 1 {
			r.Qty = 1
		}
		out.Items = append(out.Items, r.FavItem)
	}
	return out, nil
}

// TierMember is one customer on the Wall of Fame: first name and the last two digits only.
type TierMember struct {
	Name      string `json:"name"`
	PhoneHint string `json:"phone_hint"`
	Orders    int    `json:"orders"`
}

type TierWall struct {
	Tier    string       `json:"tier"`
	Min     int          `json:"min"`
	Max     *int         `json:"max"` // nil for the top tier
	Count   int          `json:"count"`
	Members []TierMember `json:"members"`
}

// TierWall groups every customer with a finished order into their badge tier, most loyal first,
// up to perTier names per tier (Count still says how many there are in all).
func (s *Store) TierWall(ctx context.Context, perTier int) ([]TierWall, error) {
	rows, err := s.db.Query(ctx, `
		SELECT phone_key, count(*) AS n, max(created_at) AS last,
		       (array_agg(customer_name ORDER BY created_at DESC))[1]
		FROM orders WHERE status = 'completed' AND phone_key IS NOT NULL AND phone_key <> ''
		GROUP BY phone_key ORDER BY n DESC, last DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]TierWall, len(Tiers))
	for i, t := range Tiers {
		out[i] = TierWall{Tier: t.Name, Min: t.Min, Members: []TierMember{}}
		if i+1 < len(Tiers) {
			m := Tiers[i+1].Min - 1
			out[i].Max = &m
		}
	}
	for rows.Next() {
		var key, name string
		var n int
		var last any
		if err := rows.Scan(&key, &n, &last, &name); err != nil {
			return nil, err
		}
		idx := -1
		for i, t := range Tiers {
			if n >= t.Min {
				idx = i
			}
		}
		if idx < 0 {
			continue
		}
		w := &out[idx]
		w.Count++
		if len(w.Members) < perTier {
			w.Members = append(w.Members, TierMember{Name: firstName(name), PhoneHint: "••" + key[len(key)-2:], Orders: n})
		}
	}
	return out, rows.Err()
}

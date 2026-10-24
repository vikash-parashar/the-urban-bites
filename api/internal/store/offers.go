package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var IST = time.FixedZone("IST", 5*60*60+30*60)

// Offer is an "offer of the day" or "offer of the month" posted by the owner.
type Offer struct {
	ID           string  `json:"id"`
	Period       string  `json:"period"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	ItemID       *string `json:"item_id"`
	ItemName     *string `json:"item_name,omitempty"`
	RegularPrice *int    `json:"regular_price,omitempty"`
	OfferPrice   *int    `json:"offer_price"`
	StartsOn     string  `json:"starts_on"`
	EndsOn       string  `json:"ends_on"`
	Active       bool    `json:"active"`
}

type OfferInput struct {
	Period      string  `json:"period"`
	Title       string  `json:"title"`
	Description string  `json:"description"`
	ItemID      *string `json:"item_id"`
	OfferPrice  *int    `json:"offer_price"`
	StartsOn    string  `json:"starts_on"`
	EndsOn      string  `json:"ends_on"`
	Active      *bool   `json:"active"`
}

func today() string { return time.Now().In(IST).Format("2006-01-02") }

// normalise fills default dates: a day offer runs today, a month offer runs to the end of this month.
func (in *OfferInput) normalise() error {
	in.Title = strings.TrimSpace(in.Title)
	in.Description = strings.TrimSpace(in.Description)
	if in.Period != "day" && in.Period != "month" {
		return fmt.Errorf("%w: period must be day or month", ErrInvalid)
	}
	if in.Title == "" || len(in.Title) > 80 || len(in.Description) > 300 {
		return fmt.Errorf("%w: title (up to 80 characters) is required; description up to 300", ErrInvalid)
	}
	if in.OfferPrice != nil && (in.ItemID == nil || *in.OfferPrice < 0) {
		return fmt.Errorf("%w: an offer price needs a menu item", ErrInvalid)
	}
	if in.ItemID != nil && *in.ItemID == "" {
		in.ItemID = nil
	}
	now := time.Now().In(IST)
	if in.StartsOn == "" {
		in.StartsOn = now.Format("2006-01-02")
	}
	if in.EndsOn == "" {
		if in.Period == "day" {
			in.EndsOn = in.StartsOn
		} else {
			start, err := time.ParseInLocation("2006-01-02", in.StartsOn, IST)
			if err != nil {
				return fmt.Errorf("%w: starts_on must be YYYY-MM-DD", ErrInvalid)
			}
			in.EndsOn = time.Date(start.Year(), start.Month()+1, 0, 0, 0, 0, 0, IST).Format("2006-01-02")
		}
	}
	for _, d := range []string{in.StartsOn, in.EndsOn} {
		if _, err := time.Parse("2006-01-02", d); err != nil {
			return fmt.Errorf("%w: dates must be YYYY-MM-DD", ErrInvalid)
		}
	}
	if in.EndsOn < in.StartsOn {
		return fmt.Errorf("%w: the offer ends before it starts", ErrInvalid)
	}
	return nil
}

const offerSelect = `
	SELECT o.id, o.period, o.title, o.description, o.item_id, m.name, m.price_full, o.offer_price,
		to_char(o.starts_on, 'YYYY-MM-DD'), to_char(o.ends_on, 'YYYY-MM-DD'), o.active
	FROM offers o LEFT JOIN menu_items m ON m.id = o.item_id`

func scanOffers(rows pgx.Rows) ([]Offer, error) {
	defer rows.Close()
	out := []Offer{}
	for rows.Next() {
		var o Offer
		if err := rows.Scan(&o.ID, &o.Period, &o.Title, &o.Description, &o.ItemID, &o.ItemName, &o.RegularPrice, &o.OfferPrice,
			&o.StartsOn, &o.EndsOn, &o.Active); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// LiveOffers are the offers customers see right now.
func (s *Store) LiveOffers(ctx context.Context) ([]Offer, error) {
	rows, err := s.db.Query(ctx, offerSelect+`
		WHERE o.active AND $1::date BETWEEN o.starts_on AND o.ends_on
		ORDER BY o.period, o.created_at DESC`, today())
	if err != nil {
		return nil, err
	}
	return scanOffers(rows)
}

// AllOffers is the owner's list: current and upcoming first, then the last 60 days.
func (s *Store) AllOffers(ctx context.Context) ([]Offer, error) {
	rows, err := s.db.Query(ctx, offerSelect+`
		WHERE o.ends_on >= $1::date - 60
		ORDER BY (o.ends_on >= $1::date) DESC, o.starts_on DESC`, today())
	if err != nil {
		return nil, err
	}
	return scanOffers(rows)
}

func (s *Store) CreateOffer(ctx context.Context, in OfferInput) (*Offer, error) {
	if err := in.normalise(); err != nil {
		return nil, err
	}
	active := in.Active == nil || *in.Active
	var id string
	err := s.db.QueryRow(ctx, `
		INSERT INTO offers (period, title, description, item_id, offer_price, starts_on, ends_on, active)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
		in.Period, in.Title, in.Description, in.ItemID, in.OfferPrice, in.StartsOn, in.EndsOn, active).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "offers_item_id_fkey") {
			return nil, fmt.Errorf("%w: unknown menu item", ErrInvalid)
		}
		return nil, err
	}
	return s.offer(ctx, id)
}

func (s *Store) UpdateOffer(ctx context.Context, id string, in OfferInput) (*Offer, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	if err := in.normalise(); err != nil {
		return nil, err
	}
	active := in.Active == nil || *in.Active
	tag, err := s.db.Exec(ctx, `
		UPDATE offers SET period = $2, title = $3, description = $4, item_id = $5, offer_price = $6,
			starts_on = $7, ends_on = $8, active = $9
		WHERE id = $1`, id, in.Period, in.Title, in.Description, in.ItemID, in.OfferPrice, in.StartsOn, in.EndsOn, active)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotFound
	}
	return s.offer(ctx, id)
}

// EndOffer switches an offer off (offers are kept for the record, not deleted).
func (s *Store) EndOffer(ctx context.Context, id string) error {
	if !uuidRe.MatchString(id) {
		return ErrNotFound
	}
	tag, err := s.db.Exec(ctx, `UPDATE offers SET active = false WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

func (s *Store) offer(ctx context.Context, id string) (*Offer, error) {
	rows, err := s.db.Query(ctx, offerSelect+` WHERE o.id = $1`, id)
	if err != nil {
		return nil, err
	}
	list, err := scanOffers(rows)
	if err != nil {
		return nil, err
	}
	if len(list) == 0 {
		return nil, ErrNotFound
	}
	return &list[0], nil
}

// activeOfferPrices maps item id → today's lowest offer price for the full plate.
func (s *Store) activeOfferPrices(ctx context.Context) (map[string]int, error) {
	rows, err := s.db.Query(ctx, `
		SELECT item_id, min(offer_price) FROM offers
		WHERE active AND item_id IS NOT NULL AND offer_price IS NOT NULL AND $1::date BETWEEN starts_on AND ends_on
		GROUP BY item_id`, today())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var id string
		var p int
		if err := rows.Scan(&id, &p); err != nil {
			return nil, err
		}
		out[id] = p
	}
	if errors.Is(rows.Err(), pgx.ErrNoRows) {
		return out, nil
	}
	return out, rows.Err()
}

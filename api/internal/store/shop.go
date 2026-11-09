package store

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"
)

// Shop holds the rules the owner can change from the app or the staff website.
type Shop struct {
	AcceptingOrders  bool      `json:"accepting_orders"`
	MinOrderDelivery int       `json:"min_order_delivery"`
	MinOrderPickup   int       `json:"min_order_pickup"`
	FreeDeliveryMin  int       `json:"free_delivery_min"`
	FreeDeliveryKm   float64   `json:"free_delivery_km"`
	MaxDeliveryKm    float64   `json:"max_delivery_km"`
	DeliveryFee      int       `json:"delivery_fee"`
	CartLat          *float64  `json:"cart_lat"`
	CartLng          *float64  `json:"cart_lng"`
	Notice           string    `json:"notice"`
	UpiID            string    `json:"upi_id"`
	UpiName          string    `json:"upi_name"`
	AcceptCash       bool      `json:"accept_cash"`
	AcceptUpi        bool      `json:"accept_upi"`
	AdsEnabled       bool      `json:"ads_enabled"`
	SponsorEnabled   bool      `json:"sponsor_enabled"`
	SponsorName      string    `json:"sponsor_name"`
	SponsorText      string    `json:"sponsor_text"`
	SponsorURL       string    `json:"sponsor_url"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (s *Store) Shop(ctx context.Context) (*Shop, error) {
	var sh Shop
	err := s.db.QueryRow(ctx, `
		SELECT accepting_orders, min_order_delivery, min_order_pickup, free_delivery_min, free_delivery_km::float8,
			max_delivery_km::float8, delivery_fee, cart_lat, cart_lng, notice, upi_id, upi_name, accept_cash, accept_upi,
			ads_enabled, sponsor_enabled, sponsor_name, sponsor_text, sponsor_url, updated_at
		FROM shop_settings WHERE id = 1`).
		Scan(&sh.AcceptingOrders, &sh.MinOrderDelivery, &sh.MinOrderPickup, &sh.FreeDeliveryMin, &sh.FreeDeliveryKm,
			&sh.MaxDeliveryKm, &sh.DeliveryFee, &sh.CartLat, &sh.CartLng, &sh.Notice, &sh.UpiID, &sh.UpiName, &sh.AcceptCash, &sh.AcceptUpi,
			&sh.AdsEnabled, &sh.SponsorEnabled, &sh.SponsorName, &sh.SponsorText, &sh.SponsorURL, &sh.UpdatedAt)
	return &sh, err
}

type ShopUpdate struct {
	AcceptingOrders  *bool    `json:"accepting_orders"`
	MinOrderDelivery *int     `json:"min_order_delivery"`
	MinOrderPickup   *int     `json:"min_order_pickup"`
	FreeDeliveryMin  *int     `json:"free_delivery_min"`
	FreeDeliveryKm   *float64 `json:"free_delivery_km"`
	MaxDeliveryKm    *float64 `json:"max_delivery_km"`
	DeliveryFee      *int     `json:"delivery_fee"`
	CartLat          *float64 `json:"cart_lat"`
	CartLng          *float64 `json:"cart_lng"`
	Notice           *string  `json:"notice"`
	UpiID            *string  `json:"upi_id"`
	UpiName          *string  `json:"upi_name"`
	AcceptCash       *bool    `json:"accept_cash"`
	AcceptUpi        *bool    `json:"accept_upi"`
	AdsEnabled       *bool    `json:"ads_enabled"`
	SponsorEnabled   *bool    `json:"sponsor_enabled"`
	SponsorName      *string  `json:"sponsor_name"`
	SponsorText      *string  `json:"sponsor_text"`
	SponsorURL       *string  `json:"sponsor_url"`
}

// OwnerMay is true when the update only touches what the owner may change: pausing orders and the delivery range.
func (u ShopUpdate) OwnerMay() bool {
	return (u.AcceptingOrders != nil || u.MaxDeliveryKm != nil) && u.MinOrderDelivery == nil && u.MinOrderPickup == nil &&
		u.FreeDeliveryMin == nil && u.FreeDeliveryKm == nil && u.DeliveryFee == nil && u.CartLat == nil && u.CartLng == nil &&
		u.Notice == nil && !u.TouchesPayments() && !u.TouchesAds()
}

// TouchesAds reports whether the update changes the ad slots (admin-only: the ad money goes to the admin).
func (u ShopUpdate) TouchesAds() bool {
	return u.AdsEnabled != nil || u.SponsorEnabled != nil || u.SponsorName != nil || u.SponsorText != nil || u.SponsorURL != nil
}

// TouchesPayments reports whether the update changes how the shop gets paid (admin-only fields).
func (u ShopUpdate) TouchesPayments() bool {
	return u.UpiID != nil || u.UpiName != nil || u.AcceptCash != nil || u.AcceptUpi != nil
}

// UpiReady is true when customers can choose UPI: it's switched on and a UPI ID is saved.
func (sh *Shop) UpiReady() bool { return sh.AcceptUpi && sh.UpiID != "" }

// Allows reports whether a customer may pick this payment method ("cash" or "online").
func (sh *Shop) Allows(method string) bool {
	if method == "online" {
		return sh.UpiReady()
	}
	return sh.AcceptCash
}

// A UPI ID (VPA) looks like name@bank: 2-256 of letters, digits, dot, dash or underscore, then @ and the handle.
var upiRe = regexp.MustCompile(`^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$`)

func (s *Store) UpdateShop(ctx context.Context, u ShopUpdate) (*Shop, error) {
	for _, v := range []*int{u.MinOrderDelivery, u.MinOrderPickup, u.FreeDeliveryMin, u.DeliveryFee} {
		if v != nil && (*v < 0 || *v > 100000) {
			return nil, fmt.Errorf("%w: amounts must be between 0 and 100000", ErrInvalid)
		}
	}
	for _, v := range []*float64{u.FreeDeliveryKm, u.MaxDeliveryKm} {
		if v != nil && (*v <= 0 || *v > 50) {
			return nil, fmt.Errorf("%w: distances must be between 0 and 50 km", ErrInvalid)
		}
	}
	if (u.CartLat == nil) != (u.CartLng == nil) {
		return nil, fmt.Errorf("%w: set cart_lat and cart_lng together", ErrInvalid)
	}
	if u.Notice != nil {
		n := strings.TrimSpace(*u.Notice)
		if len(n) > 200 {
			return nil, fmt.Errorf("%w: notice is limited to 200 characters", ErrInvalid)
		}
		u.Notice = &n
	}
	if u.UpiID != nil {
		v := strings.TrimSpace(*u.UpiID)
		if v != "" && !upiRe.MatchString(v) {
			return nil, fmt.Errorf("%w: UPI ID should look like name@bank, for example 8398907216@ybl", ErrInvalid)
		}
		u.UpiID = &v
	}
	if u.UpiName != nil {
		v := strings.TrimSpace(*u.UpiName)
		if v == "" || len(v) > 50 {
			return nil, fmt.Errorf("%w: the name shown in UPI apps must be 1 to 50 characters", ErrInvalid)
		}
		u.UpiName = &v
	}
	if err := cleanSponsor(&u); err != nil {
		return nil, err
	}
	if u.AcceptCash != nil || u.AcceptUpi != nil {
		cur, err := s.Shop(ctx)
		if err != nil {
			return nil, err
		}
		cash, upi := cur.AcceptCash, cur.AcceptUpi
		if u.AcceptCash != nil {
			cash = *u.AcceptCash
		}
		if u.AcceptUpi != nil {
			upi = *u.AcceptUpi
		}
		if !cash && !upi {
			return nil, fmt.Errorf("%w: keep at least one payment option (cash or UPI) on", ErrInvalid)
		}
	}
	_, err := s.db.Exec(ctx, `
		UPDATE shop_settings SET
			accepting_orders   = COALESCE($1, accepting_orders),
			min_order_delivery = COALESCE($2, min_order_delivery),
			min_order_pickup   = COALESCE($3, min_order_pickup),
			free_delivery_min  = COALESCE($4, free_delivery_min),
			free_delivery_km   = COALESCE($5, free_delivery_km),
			max_delivery_km    = COALESCE($6, max_delivery_km),
			delivery_fee       = COALESCE($7, delivery_fee),
			cart_lat           = COALESCE($8, cart_lat),
			cart_lng           = COALESCE($9, cart_lng),
			notice             = COALESCE($10, notice),
			upi_id             = COALESCE($11, upi_id),
			upi_name           = COALESCE($12, upi_name),
			accept_cash        = COALESCE($13, accept_cash),
			accept_upi         = COALESCE($14, accept_upi),
			ads_enabled        = COALESCE($15, ads_enabled),
			sponsor_enabled    = COALESCE($16, sponsor_enabled),
			sponsor_name       = COALESCE($17, sponsor_name),
			sponsor_text       = COALESCE($18, sponsor_text),
			sponsor_url        = COALESCE($19, sponsor_url),
			updated_at         = now()
		WHERE id = 1`,
		u.AcceptingOrders, u.MinOrderDelivery, u.MinOrderPickup, u.FreeDeliveryMin, u.FreeDeliveryKm,
		u.MaxDeliveryKm, u.DeliveryFee, u.CartLat, u.CartLng, u.Notice, u.UpiID, u.UpiName, u.AcceptCash, u.AcceptUpi,
		u.AdsEnabled, u.SponsorEnabled, u.SponsorName, u.SponsorText, u.SponsorURL)
	if err != nil {
		return nil, err
	}
	return s.Shop(ctx)
}

// cleanSponsor trims the sponsor card fields and checks their lengths and the link.
// The link must be https (or a tel:/WhatsApp link), so the card can't carry javascript: or a plain-http page.
func cleanSponsor(u *ShopUpdate) error {
	for _, f := range []struct {
		v    **string
		max  int
		name string
	}{{&u.SponsorName, 60, "sponsor name"}, {&u.SponsorText, 140, "sponsor line"}, {&u.SponsorURL, 300, "sponsor link"}} {
		if *f.v == nil {
			continue
		}
		t := strings.TrimSpace(**f.v)
		if len(t) > f.max {
			return fmt.Errorf("%w: %s is limited to %d characters", ErrInvalid, f.name, f.max)
		}
		*f.v = &t
	}
	if u.SponsorURL != nil && *u.SponsorURL != "" && !sponsorURLRe.MatchString(*u.SponsorURL) {
		return fmt.Errorf("%w: sponsor link must start with https:// (a website or https://wa.me/ number) or tel:", ErrInvalid)
	}
	return nil
}

var sponsorURLRe = regexp.MustCompile(`^(https://[^\s<>"']+|tel:\+?[0-9 \-]{6,20})$`)

// DistanceKm is the straight-line distance from the cart, or nil when either location is unknown.
// Road distance is a little longer; the owner can see the figure on the order and call if needed.
func (sh *Shop) DistanceKm(lat, lng *float64) (*float64, error) {
	if lat == nil || lng == nil || sh.CartLat == nil || sh.CartLng == nil {
		return nil, nil
	}
	if *lat < -90 || *lat > 90 || *lng < -180 || *lng > 180 {
		return nil, fmt.Errorf("%w: bad location", ErrInvalid)
	}
	const r = 6371.0
	rad := math.Pi / 180
	dLat := (*lat - *sh.CartLat) * rad
	dLng := (*lng - *sh.CartLng) * rad
	a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(*sh.CartLat*rad)*math.Cos(*lat*rad)*math.Sin(dLng/2)*math.Sin(dLng/2)
	km := math.Round(2*r*math.Asin(math.Sqrt(a))*100) / 100
	return &km, nil
}

// DeliveryFeeFor: free when the order meets the free-delivery amount and is inside the free radius
// (or the distance is unknown, in which case the owner confirms by phone).
func (sh *Shop) DeliveryFeeFor(subtotal int, km *float64) int {
	inRadius := km == nil || *km <= sh.FreeDeliveryKm
	if subtotal >= sh.FreeDeliveryMin && inRadius {
		return 0
	}
	return sh.DeliveryFee
}

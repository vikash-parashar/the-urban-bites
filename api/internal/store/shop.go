package store

import (
	"context"
	"fmt"
	"math"
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
	UpdatedAt        time.Time `json:"updated_at"`
}

func (s *Store) Shop(ctx context.Context) (*Shop, error) {
	var sh Shop
	err := s.db.QueryRow(ctx, `
		SELECT accepting_orders, min_order_delivery, min_order_pickup, free_delivery_min, free_delivery_km::float8,
			max_delivery_km::float8, delivery_fee, cart_lat, cart_lng, notice, updated_at
		FROM shop_settings WHERE id = 1`).
		Scan(&sh.AcceptingOrders, &sh.MinOrderDelivery, &sh.MinOrderPickup, &sh.FreeDeliveryMin, &sh.FreeDeliveryKm,
			&sh.MaxDeliveryKm, &sh.DeliveryFee, &sh.CartLat, &sh.CartLng, &sh.Notice, &sh.UpdatedAt)
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
}

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
			updated_at         = now()
		WHERE id = 1`,
		u.AcceptingOrders, u.MinOrderDelivery, u.MinOrderPickup, u.FreeDeliveryMin, u.FreeDeliveryKm,
		u.MaxDeliveryKm, u.DeliveryFee, u.CartLat, u.CartLng, u.Notice)
	if err != nil {
		return nil, err
	}
	return s.Shop(ctx)
}

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

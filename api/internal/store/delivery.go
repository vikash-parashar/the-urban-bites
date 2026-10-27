package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---- Delivery partners ----

// RiderOrders lists the delivery orders a rider can work on: open ones nobody has taken yet,
// the rider's own open ones, and what the rider delivered in the last 12 hours.
func (s *Store) RiderOrders(ctx context.Context, riderID string) ([]*Order, error) {
	rows, err := s.db.Query(ctx, `SELECT `+orderCols+` FROM orders
		WHERE fulfilment = 'delivery' AND created_at > now() - interval '2 days' AND (
			(status IN ('accepted', 'preparing', 'ready', 'out_for_delivery') AND (rider_id IS NULL OR rider_id = $1))
			OR (status = 'completed' AND rider_id = $1 AND updated_at > now() - interval '12 hours'))
		ORDER BY CASE WHEN status = 'completed' THEN 1 ELSE 0 END, created_at`, riderID)
	if err != nil {
		return nil, err
	}
	out := []*Order{}
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
	return out, s.loadLines(ctx, out)
}

// RiderAction is what a delivery partner does with an order.
type RiderAction string

const (
	RiderTake      RiderAction = "take"      // "I'll deliver this one"
	RiderLeave     RiderAction = "leave"     // give it back so another rider can take it
	RiderStart     RiderAction = "start"     // picked up from the cart, on the way
	RiderDelivered RiderAction = "delivered" // handed over
)

// RiderUpdate applies a rider's action. cashCollected marks a cash order paid on delivery.
func (s *Store) RiderUpdate(ctx context.Context, orderID, riderID string, a RiderAction, cashCollected bool) (*Order, error) {
	if !uuidRe.MatchString(orderID) {
		return nil, ErrNotFound
	}
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var status Status
		var rider *string
		err := tx.QueryRow(ctx, `SELECT status, rider_id::text FROM orders WHERE id = $1 AND fulfilment = 'delivery' FOR UPDATE`, orderID).Scan(&status, &rider)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		mine := rider != nil && *rider == riderID
		if rider != nil && !mine {
			return fmt.Errorf("%w: Another delivery partner already has this order.", ErrConflict)
		}
		open := status == StatusAccepted || status == StatusPreparing || status == StatusReady || status == StatusOutForDelivery
		if !open {
			return fmt.Errorf("%w: This order is %s, so it can't be changed now.", ErrConflict, status)
		}
		var newStatus *Status
		switch a {
		case RiderTake:
			_, err = tx.Exec(ctx, `UPDATE orders SET rider_id = $2, rider_picked_at = NULL, updated_at = now() WHERE id = $1`, orderID, riderID)
		case RiderLeave:
			if !mine {
				return fmt.Errorf("%w: This order isn't yours.", ErrConflict)
			}
			if status == StatusOutForDelivery {
				return fmt.Errorf("%w: You're already on the way with this order. Call the shop to hand it over.", ErrConflict)
			}
			_, err = tx.Exec(ctx, `UPDATE orders SET rider_id = NULL, rider_picked_at = NULL, updated_at = now() WHERE id = $1`, orderID)
		case RiderStart:
			st := StatusOutForDelivery
			newStatus = &st
			_, err = tx.Exec(ctx, `UPDATE orders SET rider_id = $2, rider_picked_at = now(), status = 'out_for_delivery', updated_at = now() WHERE id = $1`, orderID, riderID)
		case RiderDelivered:
			if !mine {
				return fmt.Errorf("%w: Take the order first.", ErrConflict)
			}
			st := StatusCompleted
			newStatus = &st
			_, err = tx.Exec(ctx, `UPDATE orders SET status = 'completed',
				payment_status = CASE WHEN $2 AND payment_method = 'cash' THEN 'paid'::payment_status ELSE payment_status END,
				updated_at = now() WHERE id = $1`, orderID, cashCollected)
		default:
			return fmt.Errorf("%w: unknown action", ErrInvalid)
		}
		if err != nil {
			return err
		}
		if newStatus != nil && *newStatus != status {
			_, err = tx.Exec(ctx, `INSERT INTO order_events (order_id, status) VALUES ($1, $2)`, orderID, *newStatus)
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return s.Order(ctx, orderID)
}

// ---- Voice notes for the kitchen ----

const MaxVoiceNote = 1 << 20 // 1 MB is about a minute of compressed speech

// SaveVoiceNote stores (or replaces) the order's voice note. Only allowed in the first 15 minutes.
func (s *Store) SaveVoiceNote(ctx context.Context, orderID, mime string, data []byte) error {
	if len(data) == 0 || len(data) > MaxVoiceNote {
		return fmt.Errorf("%w: voice note must be under a minute", ErrInvalid)
	}
	var created time.Time
	if err := s.db.QueryRow(ctx, `SELECT created_at FROM orders WHERE id = $1`, orderID).Scan(&created); errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	if time.Since(created) > 15*time.Minute {
		return fmt.Errorf("%w: voice notes can only be added just after ordering", ErrInvalid)
	}
	_, err := s.db.Exec(ctx, `INSERT INTO order_voice_notes (order_id, mime, data) VALUES ($1, $2, $3)
		ON CONFLICT (order_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, created_at = now()`, orderID, mime, data)
	return err
}

func (s *Store) VoiceNote(ctx context.Context, orderID string) (mime string, data []byte, err error) {
	if !uuidRe.MatchString(orderID) {
		return "", nil, ErrNotFound
	}
	err = s.db.QueryRow(ctx, `SELECT mime, data FROM order_voice_notes WHERE order_id = $1`, orderID).Scan(&mime, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrNotFound
	}
	return mime, data, err
}

// Riders lists delivery partner accounts (for the owner).
func (s *Store) Riders(ctx context.Context) ([]*User, error) {
	rows, err := s.db.Query(ctx, `SELECT `+userCols+` FROM users WHERE role = 'delivery' ORDER BY active DESC, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

package store

import (
	"context"
	"fmt"
)

// A push token is the address Firebase gives one app install. They are opaque, but never tiny or huge.
func validPushToken(t string) error {
	if len(t) < 20 || len(t) > 4096 {
		return fmt.Errorf("%w: bad push token", ErrInvalid)
	}
	return nil
}

// SaveStaffPushToken ties this phone to a staff login. A phone that changes hands moves to the new login.
func (s *Store) SaveStaffPushToken(ctx context.Context, userID, token string) error {
	if err := validPushToken(token); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO staff_push_tokens (token, user_id) VALUES ($1, $2)
		ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()`, token, userID)
	return err
}

// DeleteStaffPushToken stops pushes to this phone (sign out). Only the owner of the token can remove it.
func (s *Store) DeleteStaffPushToken(ctx context.Context, userID, token string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM staff_push_tokens WHERE token = $1 AND user_id = $2`, token, userID)
	return err
}

// StaffPushTokens returns the phones of active staff with one of these roles that are still signed in
// (a sign-out on all devices or a password change after the token was saved drops it).
func (s *Store) StaffPushTokens(ctx context.Context, roles ...string) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT t.token FROM staff_push_tokens t JOIN users u ON u.id = t.user_id
		WHERE u.active AND u.role::text = ANY($1)
		  AND t.updated_at > u.signed_out_at AND t.updated_at > COALESCE(u.password_changed_at, 'epoch')`, roles)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SaveOrderPushToken lets a customer's phone hear about this one order. A few phones per order at most.
func (s *Store) SaveOrderPushToken(ctx context.Context, orderID, token string) error {
	if err := validPushToken(token); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `
		INSERT INTO order_push_tokens (order_id, token)
		SELECT $1, $2 WHERE (SELECT count(*) FROM order_push_tokens WHERE order_id = $1) < 5
		ON CONFLICT DO NOTHING`, orderID, token)
	return err
}

func (s *Store) OrderPushTokens(ctx context.Context, orderID string) ([]string, error) {
	rows, err := s.db.Query(ctx, `SELECT token FROM order_push_tokens WHERE order_id = $1`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// ForgetPushToken drops a token Firebase says is dead (app uninstalled).
func (s *Store) ForgetPushToken(ctx context.Context, token string) error {
	if _, err := s.db.Exec(ctx, `DELETE FROM staff_push_tokens WHERE token = $1`, token); err != nil {
		return err
	}
	_, err := s.db.Exec(ctx, `DELETE FROM order_push_tokens WHERE token = $1`, token)
	return err
}

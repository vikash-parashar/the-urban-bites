package store

import (
	"context"
	"fmt"
	"strings"
)

// WebPushSub is one browser's Web Push subscription (from PushManager.subscribe).
type WebPushSub struct {
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// SaveWebPushSub stores a subscription for a staff member. The same browser subscribing again (or a
// different person signing in on that tablet) just takes the row over.
func (s *Store) SaveWebPushSub(ctx context.Context, userID string, p WebPushSub, userAgent string) error {
	if !strings.HasPrefix(p.Endpoint, "https://") || len(p.Endpoint) > 1000 || p.P256dh == "" || p.Auth == "" || len(p.P256dh) > 200 || len(p.Auth) > 100 {
		return fmt.Errorf("%w: bad web push subscription", ErrInvalid)
	}
	if len(userAgent) > 300 {
		userAgent = userAgent[:300]
	}
	_, err := s.db.Exec(ctx, `INSERT INTO web_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (endpoint) DO UPDATE SET user_id = $2, p256dh = $3, auth = $4, user_agent = $5, created_at = now()`,
		p.Endpoint, userID, p.P256dh, p.Auth, userAgent)
	return err
}

// DeleteWebPushSub removes one subscription: alerts turned off, or the push service said it is gone.
func (s *Store) DeleteWebPushSub(ctx context.Context, endpoint string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM web_push_subscriptions WHERE endpoint = $1`, endpoint)
	return err
}

// DeleteUserWebPushSubs removes every subscription of one person ("sign out everywhere").
func (s *Store) DeleteUserWebPushSubs(ctx context.Context, userID string) error {
	_, err := s.db.Exec(ctx, `DELETE FROM web_push_subscriptions WHERE user_id = $1`, userID)
	return err
}

// WebPushSubsForRoles lists the subscriptions of active staff with one of these roles.
func (s *Store) WebPushSubsForRoles(ctx context.Context, roles ...string) ([]WebPushSub, error) {
	rows, err := s.db.Query(ctx, `SELECT p.endpoint, p.p256dh, p.auth FROM web_push_subscriptions p
		JOIN users u ON u.id = p.user_id WHERE u.active AND u.role = ANY($1)`, roles)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []WebPushSub
	for rows.Next() {
		var p WebPushSub
		if err := rows.Scan(&p.Endpoint, &p.P256dh, &p.Auth); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// Package push sends Web Push notifications (VAPID) to staff browsers, so a new order rings the
// owner's phone or tablet even when the website is closed.
//
// Keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (make a pair with `go run ./cmd/seed -vapid`).
// Without them, Notify does nothing and the orders screen keeps working as before (polling + bell).
package push

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"

	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

type Sender struct {
	PublicKey  string // VAPID_PUBLIC_KEY, also handed to the browser to subscribe
	PrivateKey string // VAPID_PRIVATE_KEY
	Subject    string // VAPID_SUBJECT: a contact email or https URL the push services can reach
	Client     *http.Client
}

// Message is what the service worker (web/public/sw.js) turns into a notification.
type Message struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url,omitempty"` // opened when the notification is tapped
	Tag   string `json:"tag,omitempty"` // same tag replaces the earlier notification
	// Kind lets the service worker pick the vibration pattern: "new_order" or "cancelled".
	Kind string `json:"kind,omitempty"`
	// TTL is how long the push service keeps it for a phone that is offline (default 1 hour).
	TTL time.Duration `json:"-"`
}

func (s *Sender) Configured() bool { return s != nil && s.PublicKey != "" && s.PrivateKey != "" }

// Notify sends m to every subscription at once and waits (at most a few seconds) for all of them,
// because on Lambda nothing runs after the response is sent. It returns the endpoints the push
// service says are gone (uninstalled, permission revoked) so the caller can delete them.
func (s *Sender) Notify(ctx context.Context, subs []store.PushSub, m Message) (gone []string) {
	if !s.Configured() || len(subs) == 0 {
		return nil
	}
	body, _ := json.Marshal(m)
	ttl := m.TTL
	if ttl <= 0 {
		ttl = time.Hour
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	client := s.Client
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	opts := &webpush.Options{
		HTTPClient:      client,
		Subscriber:      strings.TrimPrefix(s.Subject, "mailto:"),
		VAPIDPublicKey:  s.PublicKey,
		VAPIDPrivateKey: s.PrivateKey,
		TTL:             int(ttl.Seconds()),
		Urgency:         webpush.UrgencyHigh, // wake the phone even in battery saver
		Topic:           topic(m.Tag),
	}
	var mu sync.Mutex
	var wg sync.WaitGroup
	for _, sub := range subs {
		wg.Add(1)
		go func() {
			defer wg.Done()
			res, err := webpush.SendNotificationWithContext(ctx, body, &webpush.Subscription{
				Endpoint: sub.Endpoint,
				Keys:     webpush.Keys{Auth: sub.Auth, P256dh: sub.P256dh},
			}, opts)
			if err != nil {
				slog.WarnContext(ctx, "web push failed", "host", host(sub.Endpoint), "err", err)
				return
			}
			defer res.Body.Close()
			switch {
			case res.StatusCode == http.StatusGone || res.StatusCode == http.StatusNotFound:
				mu.Lock()
				gone = append(gone, sub.Endpoint)
				mu.Unlock()
			case res.StatusCode >= 300:
				msg, _ := io.ReadAll(io.LimitReader(res.Body, 300))
				slog.WarnContext(ctx, "web push rejected", "host", host(sub.Endpoint), "status", res.StatusCode, "body", string(msg))
			}
		}()
	}
	wg.Wait()
	return gone
}

// topic: the Topic header allows only URL-safe base64 characters, at most 32 of them.
func topic(tag string) string {
	var b strings.Builder
	for _, r := range tag {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		}
		if b.Len() == 32 {
			break
		}
	}
	return b.String()
}

func host(endpoint string) string {
	h := strings.TrimPrefix(endpoint, "https://")
	if i := strings.IndexByte(h, '/'); i >= 0 {
		h = h[:i]
	}
	return h
}

// GenerateKeys makes a new VAPID key pair (base64url). Keep the pair: changing it means every
// device has to turn alerts on again.
func GenerateKeys() (publicKey, privateKey string, err error) {
	privateKey, publicKey, err = webpush.GenerateVAPIDKeys()
	return publicKey, privateKey, err
}

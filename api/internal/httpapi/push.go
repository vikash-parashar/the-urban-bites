package httpapi

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/vikash-parashar/urban-bites/api/internal/push"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

// pushKey hands the browser the VAPID public key it needs to subscribe. Empty when push isn't set up,
// so the staff screen can hide the "alerts when closed" switch.
func (s *Server) pushKey(w http.ResponseWriter, _ *http.Request) {
	key := ""
	if s.Push.Configured() {
		key = s.Push.PublicKey
	}
	writeJSON(w, http.StatusOK, map[string]string{"public_key": key})
}

// pushSubscribe saves this browser's subscription for the signed-in staff member. The staff screen
// also re-sends it quietly on every visit, so a subscription the browser rotated is picked up.
func (s *Server) pushSubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		// Test: send a "alerts are on" ping, when the owner has just pressed the switch.
		Test     bool   `json:"test"`
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if !s.Push.Configured() {
		writeErr(w, r, errInvalid("order alerts aren't set up on the server yet"))
		return
	}
	sub := store.PushSub{Endpoint: in.Endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth}
	if err := s.Store.SavePushSub(r.Context(), staffFrom(r).ID, sub, r.UserAgent()); err != nil {
		writeErr(w, r, err)
		return
	}
	if !in.Test {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	// A test ping, so the owner sees straight away that it works on this phone.
	s.Push.Notify(context.WithoutCancel(r.Context()), []store.PushSub{sub}, push.Message{
		Title: "Order alerts are on ✅",
		Body:  "New orders will ring here even when the app is closed.",
		URL:   "./?app=staff#staff",
		Tag:   "alerts-on",
		TTL:   5 * time.Minute,
	})
	w.WriteHeader(http.StatusNoContent)
}

// pushUnsubscribe drops this browser's subscription (alerts turned off, or signing out).
func (s *Server) pushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := s.Store.DeletePushSub(r.Context(), in.Endpoint); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// notifyStaff pushes m to the owner's and admin's devices. Call it after the response is written:
// the response is flushed first where the server allows it, and the send waits at most a few
// seconds so it still completes on Lambda. Failures are logged; the order itself is already saved.
func (s *Server) notifyStaff(w http.ResponseWriter, r *http.Request, m push.Message) {
	if !s.Push.Configured() {
		return
	}
	if f, ok := w.(http.Flusher); ok {
		f.Flush()
	}
	ctx := context.WithoutCancel(r.Context())
	subs, err := s.Store.PushSubsForRoles(ctx, "owner", "admin")
	if err != nil {
		slog.ErrorContext(ctx, "push subscriptions", "err", err)
		return
	}
	for _, e := range s.Push.Notify(ctx, subs, m) {
		if err := s.Store.DeletePushSub(ctx, e); err != nil {
			slog.WarnContext(ctx, "delete expired push subscription", "err", err)
		}
	}
}

// newOrderMessage: "🔔 New order #42 · ₹480" / "Rahul · Pickup · 2× Paneer Tikka, Naan".
func newOrderMessage(o *store.Order) push.Message {
	var items []string
	for i, l := range o.Items {
		if i == 3 {
			items = append(items, fmt.Sprintf("+%d more", len(o.Items)-3))
			break
		}
		items = append(items, fmt.Sprintf("%d× %s", l.Qty, l.Name))
	}
	how := "Pickup"
	if o.Fulfilment == "delivery" {
		how = "Delivery"
	}
	return push.Message{
		Title: fmt.Sprintf("🔔 New order #%d · ₹%d", o.Number, o.Total),
		Body:  fmt.Sprintf("%s · %s · %s\nTap to set the cooking time.", o.CustomerName, how, strings.Join(items, ", ")),
		URL:   "./?app=staff#staff",
		Tag:   "order-" + o.ID,
		Kind:  "new_order",
		TTL:   2 * time.Hour,
	}
}

func cancelledMessage(o *store.Order) push.Message {
	return push.Message{
		Title: fmt.Sprintf("❌ Order #%d cancelled by customer", o.Number),
		Body:  fmt.Sprintf("%s cancelled. Don't make it.", o.CustomerName),
		URL:   "./?app=staff#staff",
		Tag:   "order-" + o.ID,
		Kind:  "cancelled",
		TTL:   time.Hour,
	}
}

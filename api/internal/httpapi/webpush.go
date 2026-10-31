package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/vikash-parashar/urban-bites/api/internal/push"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
	"github.com/vikash-parashar/urban-bites/api/internal/webpush"
)

// Browser order alerts (Web Push) for staff who use Chrome or the installed "UB Orders" web app
// instead of the Android app. Every staff push (pushStaff) goes to both.

// webPushKey hands the browser the VAPID public key it needs to subscribe. Empty when it isn't set
// up, so the staff screen hides the "Turn on alerts" bar.
func (s *Server) webPushKey(w http.ResponseWriter, _ *http.Request) {
	key := ""
	if s.WebPush.Configured() {
		key = s.WebPush.PublicKey
	}
	writeJSON(w, http.StatusOK, map[string]string{"public_key": key})
}

// webPushSubscribe saves this browser's subscription for the signed-in staff member. The staff screen
// also re-sends it quietly on every visit, so a subscription the browser rotated is picked up.
func (s *Server) webPushSubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		// Test: send an "alerts are on" ping, when the owner has just pressed the button.
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
	if !s.WebPush.Configured() {
		writeErr(w, r, errInvalid("order alerts aren't set up on the server yet"))
		return
	}
	sub := store.WebPushSub{Endpoint: in.Endpoint, P256dh: in.Keys.P256dh, Auth: in.Keys.Auth}
	if err := s.Store.SaveWebPushSub(r.Context(), staffFrom(r).ID, sub, r.UserAgent()); err != nil {
		writeErr(w, r, err)
		return
	}
	if in.Test {
		// So the owner sees straight away that it works on this phone.
		s.WebPush.Notify(context.WithoutCancel(r.Context()), []store.WebPushSub{sub}, webpush.Message{
			Title: "Order alerts are on ✅",
			Body:  "New orders will ring here even when the app is closed.",
			URL:   "./?app=staff#staff",
			Tag:   "alerts-on",
			TTL:   5 * time.Minute,
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// webPushUnsubscribe drops this browser's subscription (alerts turned off).
func (s *Server) webPushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Endpoint string `json:"endpoint"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := s.Store.DeleteWebPushSub(r.Context(), in.Endpoint); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// webPushStaff sends a staff alert to the browsers of these roles, in the background like pushTo.
// Endpoints the push service says are gone (uninstalled, permission revoked) are deleted.
func (s *Server) webPushStaff(m push.Message, roles ...string) {
	if !s.WebPush.Configured() {
		return
	}
	wm := webpush.Message{Title: m.Title, Body: m.Body, URL: "./?app=staff" + m.Open, Tag: m.Tag, TTL: 2 * time.Hour}
	if m.Channel == push.ChannelOrders {
		wm.Kind = "new_order" // loud, stays on screen until tapped
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		subs, err := s.Store.WebPushSubsForRoles(ctx, roles...)
		if err != nil {
			slog.Error("web push subscriptions", "err", err)
			return
		}
		for _, e := range s.WebPush.Notify(ctx, subs, wm) {
			if err := s.Store.DeleteWebPushSub(ctx, e); err != nil {
				slog.Warn("delete expired web push subscription", "err", err)
			}
		}
	}()
}

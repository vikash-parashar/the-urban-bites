package httpapi

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vikash-parashar/urban-bites/api/internal/push"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

// ---- saving tokens ----

// staffPushToken: the app on a staff phone registers itself after sign-in, so new orders ring it while closed.
func (s *Server) staffPushToken(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"token"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	var err error
	if r.Method == http.MethodDelete {
		err = s.Store.DeleteStaffPushToken(r.Context(), staffFrom(r).ID, in.Token)
	} else {
		err = s.Store.SaveStaffPushToken(r.Context(), staffFrom(r).ID, in.Token)
	}
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// orderPushToken: a customer's app asks to hear about this order (needs the order's tracking token).
func (s *Server) orderPushToken(w http.ResponseWriter, r *http.Request) {
	var in struct {
		T     string `json:"t"`
		Token string `json:"token"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	o, err := s.Store.Order(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if subtle.ConstantTimeCompare([]byte(in.T), []byte(o.TrackToken)) != 1 {
		writeErr(w, r, store.ErrNotFound)
		return
	}
	if err := s.Store.SaveOrderPushToken(r.Context(), o.ID, in.Token); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- sending ----

// pushTo sends in the background, so a slow Firebase never holds up an order. Dead tokens are forgotten.
func (s *Server) pushTo(tokens func(context.Context) ([]string, error), m push.Message) {
	if !s.Push.Enabled() {
		return
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		list, err := tokens(ctx)
		if err != nil {
			slog.Error("push tokens", "err", err)
			return
		}
		for _, t := range list {
			err := s.Push.Send(ctx, t, m)
			if errors.Is(err, push.ErrDeadToken) {
				_ = s.Store.ForgetPushToken(ctx, t)
			} else if err != nil {
				slog.Warn("push send", "err", err)
			}
		}
	}()
}

func (s *Server) pushStaff(m push.Message, roles ...string) {
	s.pushTo(func(ctx context.Context) ([]string, error) { return s.Store.StaffPushTokens(ctx, roles...) }, m)
}

func (s *Server) pushCustomer(orderID string, m push.Message) {
	s.pushTo(func(ctx context.Context) ([]string, error) { return s.Store.OrderPushTokens(ctx, orderID) }, m)
}

func modeHi(o *store.Order) string {
	if o.Fulfilment == "delivery" {
		return "डिलीवरी"
	}
	return "पिकअप"
}

func (s *Server) pushNewOrder(o *store.Order) {
	s.pushStaff(push.Message{
		Title:   fmt.Sprintf("🛎️ नया ऑर्डर #%d", o.Number),
		Body:    fmt.Sprintf("%s जी · %s · ₹%d", o.CustomerName, modeHi(o), o.Total),
		Channel: push.ChannelOrders, Open: "#staff", Tag: fmt.Sprintf("order-%d", o.Number),
	}, "owner", "admin")
}

func (s *Server) pushCustomerCancelled(o *store.Order) {
	s.pushStaff(push.Message{
		Title:   fmt.Sprintf("❌ ऑर्डर #%d कैंसल", o.Number),
		Body:    fmt.Sprintf("%s जी ने ऑर्डर कैंसल कर दिया", o.CustomerName),
		Channel: push.ChannelOrders, Open: "#staff", Tag: fmt.Sprintf("order-%d", o.Number),
	}, "owner", "admin")
}

// pushOrderChange tells the customer (and riders, for a delivery that is ready) what changed.
func (s *Server) pushOrderChange(before, after *store.Order) {
	tag := fmt.Sprintf("order-%d", after.Number)
	msg := func(title, body string) push.Message {
		return push.Message{Title: title, Body: body, Channel: push.ChannelUpdates, Open: "#", Tag: tag}
	}
	if after.Status == before.Status {
		// The cooking time was set or changed.
		if after.PrepMinutes != nil && (before.PrepMinutes == nil || *before.PrepMinutes != *after.PrepMinutes) &&
			after.Status != "ready" && after.Status != "out_for_delivery" && after.Status != "completed" && after.Status != "cancelled" {
			s.pushCustomer(after.ID, msg(fmt.Sprintf("👨‍🍳 ऑर्डर #%d बन रहा है", after.Number),
				fmt.Sprintf("लगभग %d मिनट में तैयार हो जायेगा जी", *after.PrepMinutes)))
		}
		return
	}
	switch after.Status {
	case "ready":
		body := "काउंटर पे आ के ले लो जी"
		if after.Fulfilment == "delivery" {
			body = "जल्दी ही डिलीवरी के लिए निकलेगा"
			if after.RiderID == nil {
				s.pushStaff(push.Message{
					Title:   fmt.Sprintf("🛵 डिलीवरी तैयार #%d", after.Number),
					Body:    fmt.Sprintf("%s जी · ₹%d · खोल के ऑर्डर ले लो", after.CustomerName, after.Total),
					Channel: push.ChannelOrders, Open: "#staff", Tag: tag,
				}, "delivery")
			}
		}
		s.pushCustomer(after.ID, msg(fmt.Sprintf("✅ थारा ऑर्डर #%d तैयार सै!", after.Number), body))
	case "out_for_delivery":
		s.pushCustomer(after.ID, msg(fmt.Sprintf("🛵 ऑर्डर #%d रास्ते में सै", after.Number), "डिलीवरी पार्टनर निकल गया जी"))
	case "cancelled":
		if after.CancelledBy != nil && *after.CancelledBy == "owner" {
			s.pushCustomer(after.ID, msg(fmt.Sprintf("ऑर्डर #%d कैंसल हो गया", after.Number), "कोई सवाल हो तो दुकान पे फ़ोन करो जी"))
		}
	}
}

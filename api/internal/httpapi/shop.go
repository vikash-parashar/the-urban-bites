package httpapi

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

// ---- public: shop rules, offers, badges ----

func (s *Server) getShop(w http.ResponseWriter, r *http.Request) {
	sh, err := s.Store.Shop(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	writeJSON(w, http.StatusOK, sh)
}

func (s *Server) liveOffers(w http.ResponseWriter, r *http.Request) {
	offers, err := s.Store.LiveOffers(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	writeJSON(w, http.StatusOK, map[string]any{"offers": offers})
}

// badge answers "how many orders have I placed and what's my badge?" for a phone number.
// It only reveals counts, never names or orders.
func (s *Server) badge(w http.ResponseWriter, r *http.Request) {
	b, err := s.Store.CustomerBadge(r.Context(), r.URL.Query().Get("phone"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, b)
}

func (s *Server) regulars(w http.ResponseWriter, r *http.Request) {
	list, err := s.Store.Leaderboard(r.Context(), 12)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=60")
	writeJSON(w, http.StatusOK, map[string]any{"regulars": list, "tiers": store.Tiers, "monthly_min": store.MonthlyTopMin})
}

// ---- staff ----

func (s *Server) updateShop(w http.ResponseWriter, r *http.Request) {
	var in store.ShopUpdate
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if in.TouchesPayments() && staffFrom(r).Role != "admin" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only the admin can change payment settings"})
		return
	}
	sh, err := s.Store.UpdateShop(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sh)
}

func (s *Server) allOffers(w http.ResponseWriter, r *http.Request) {
	offers, err := s.Store.AllOffers(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"offers": offers})
}

func (s *Server) createOffer(w http.ResponseWriter, r *http.Request) {
	var in store.OfferInput
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	o, err := s.Store.CreateOffer(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, o)
}

func (s *Server) updateOffer(w http.ResponseWriter, r *http.Request) {
	var in store.OfferInput
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	o, err := s.Store.UpdateOffer(r.Context(), chi.URLParam(r, "id"), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (s *Server) endOffer(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.EndOffer(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// counterSale records a walk-in sale so it counts in earnings and in the customer's badge.
func (s *Server) counterSale(w http.ResponseWriter, r *http.Request) {
	var in store.CounterSale
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if in.CustomerPhone != "" {
		phone, err := store.NormalizePhone(in.CustomerPhone)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		in.CustomerPhone = phone
	}
	o, err := s.Store.CreateCounterSale(r.Context(), in)
	if err == nil {
		err = s.addBadges(r.Context(), o)
	}
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, o)
}

// addBadges fills each order's customer_orders and customer_badge so the owner can spot regulars.
func (s *Server) addBadges(ctx context.Context, orders ...*store.Order) error {
	keys := make([]string, 0, len(orders))
	for _, o := range orders {
		if k := store.PhoneKey(o.CustomerPhone); k != "" {
			keys = append(keys, k)
		}
	}
	counts, err := s.Store.OrderCounts(ctx, keys)
	if err != nil {
		return err
	}
	for _, o := range orders {
		o.CustomerOrders = counts[store.PhoneKey(o.CustomerPhone)]
		o.CustomerBadge = store.BadgeName(o.CustomerOrders)
	}
	return nil
}

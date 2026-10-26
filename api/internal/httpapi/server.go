// Package httpapi exposes the store over JSON HTTP for the website and the Android app.
package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/vikash-parashar/urban-bites/api/internal/auth"
	"github.com/vikash-parashar/urban-bites/api/internal/mail"
	"github.com/vikash-parashar/urban-bites/api/internal/ratelimit"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

type Server struct {
	Store          *store.Store
	Auth           *auth.Service
	Mail           *mail.Sender
	SiteURL        string // the website, for links in emails
	AllowedOrigins []string

	loginLimit  ratelimit.Limiter
	forgotLimit ratelimit.Limiter
	ipLimit     ratelimit.Limiter // all sign-in attempts from one address
}

type ctxKey struct{}

func staffFrom(r *http.Request) *auth.Staff { return r.Context().Value(ctxKey{}).(*auth.Staff) }

var ist = time.FixedZone("IST", 5*60*60+30*60)

func (s *Server) Routes() http.Handler {
	s.loginLimit = ratelimit.Limiter{Max: 10, Window: 15 * time.Minute}
	s.forgotLimit = ratelimit.Limiter{Max: 5, Window: time.Hour}
	s.ipLimit = ratelimit.Limiter{Max: 40, Window: 15 * time.Minute}
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Recoverer)
	r.Use(middleware.Timeout(15 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: s.AllowedOrigins,
		AllowedMethods: []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type", "Authorization", "X-Client"},
		MaxAge:         600,
	}))

	r.Get("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.Write([]byte("ok")) })

	r.Route("/v1", func(r chi.Router) {
		// Customer side: website and the app's customer mode.
		r.Get("/menu", s.getMenu)
		r.Post("/orders", s.createOrder)
		r.Get("/orders/{id}", s.trackOrder)
		r.Post("/orders/{id}/payment", s.paymentRef)
		r.Get("/shop", s.getShop)
		r.Get("/offers", s.liveOffers)
		r.Get("/badge", s.badge)
		r.Get("/regulars", s.regulars)

		// Staff side: the owner and the admin. Both run the cart; only the admin manages staff accounts.
		r.Post("/owner/login", s.login)
		r.Post("/owner/forgot", s.forgotPassword)
		r.Post("/owner/reset", s.resetPassword)
		r.Group(func(r chi.Router) {
			r.Use(s.requireStaff)
			r.Get("/me", s.me)
			r.Post("/me/password", s.changePassword)
			r.Get("/owner/orders", s.listOrders)
			r.Get("/owner/orders/{id}", s.getOrder)
			r.Patch("/owner/orders/{id}", s.updateOrder)
			r.Get("/owner/menu", s.ownerMenu)
			r.Post("/owner/menu/items", s.createItem)
			r.Patch("/owner/menu/items/{id}", s.updateItem)
			r.Delete("/owner/menu/items/{id}", s.deleteItem)
			r.Post("/owner/menu/categories", s.createCategory)
			r.Get("/owner/earnings", s.earnings)
			r.Get("/owner/dashboard", s.dashboard)
			r.Get("/owner/expenses", s.listExpenses)
			r.Post("/owner/expenses", s.addExpense)
			r.Delete("/owner/expenses/{id}", s.deleteExpense)
			r.Patch("/owner/shop", s.updateShop)
			r.Get("/owner/offers", s.allOffers)
			r.Post("/owner/offers", s.createOffer)
			r.Put("/owner/offers/{id}", s.updateOffer)
			r.Post("/owner/offers/{id}/end", s.endOffer)
			r.Post("/owner/counter-sales", s.counterSale)

			r.Group(func(r chi.Router) {
				r.Use(requireRole("admin"))
				r.Get("/admin/users", s.listUsers)
				r.Post("/admin/users", s.createUser)
				r.Patch("/admin/users/{id}", s.updateUser)
			})
		})
	})
	return r
}

// ---- helpers ----

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// customerMessage drops the sentinel prefix ("invalid request: ") so people see only the useful part.
func customerMessage(err error) string {
	msg := err.Error()
	if _, after, ok := strings.Cut(msg, ": "); ok {
		return after
	}
	return msg
}

func writeErr(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	case errors.Is(err, store.ErrClosed), errors.Is(err, store.ErrBelowMinimum), errors.Is(err, store.ErrTooFar):
		// These carry a customer-facing message after the sentinel; send just the message.
		msg := err.Error()
		if _, after, ok := strings.Cut(msg, ": "); ok {
			msg = after
		}
		code := "closed"
		if errors.Is(err, store.ErrBelowMinimum) {
			code = "below_minimum"
		} else if errors.Is(err, store.ErrTooFar) {
			code = "too_far"
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": msg, "code": code})
	case errors.Is(err, store.ErrInvalid), errors.Is(err, store.ErrUnavailable):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": customerMessage(err)})
	case errors.Is(err, store.ErrConflict):
		writeJSON(w, http.StatusConflict, map[string]string{"error": customerMessage(err)})
	case errors.Is(err, store.ErrDuplicate):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	case errors.Is(err, auth.ErrWeakPassword):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
	case errors.Is(err, auth.ErrWrongCurrent), errors.Is(err, auth.ErrSamePassword):
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
	case errors.Is(err, auth.ErrBadCredentials):
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
	default:
		slog.ErrorContext(r.Context(), "request failed", "path", r.URL.Path, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "something went wrong"})
	}
}

func decode(r *http.Request, v any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fmt.Errorf("%w: %v", store.ErrInvalid, err)
	}
	return nil
}

func (s *Server) requireStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "sign in with your staff email"})
			return
		}
		staff, err := s.Auth.Verify(r.Context(), token)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "sign in with your staff email"})
			return
		}
		// With a temporary password, the only thing allowed is choosing a real one.
		if staff.MustChangePassword && r.URL.Path != "/v1/me" && r.URL.Path != "/v1/me/password" {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "choose your own password first", "code": "password_change_required"})
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, staff)))
	})
}

func requireRole(role string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if staffFrom(r).Role != role {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "only the admin can do this"})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ---- customer ----

func (s *Server) getMenu(w http.ResponseWriter, r *http.Request) {
	menu, err := s.Store.Menu(r.Context(), false)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	writeJSON(w, http.StatusOK, map[string]any{"categories": menu})
}

// Names: letters (any script, so Hindi works), spaces, dots and apostrophes.
var nameRe = regexp.MustCompile(`^[\p{L}][\p{L}\p{M} .']{1,59}$`)

func (s *Server) createOrder(w http.ResponseWriter, r *http.Request) {
	var in store.NewOrder
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	in.CustomerName = strings.TrimSpace(in.CustomerName)
	in.CustomerPhone = strings.TrimSpace(in.CustomerPhone)
	if !nameRe.MatchString(in.CustomerName) {
		writeErr(w, r, fmt.Errorf("%w: enter your name (letters only, 2 to 60 characters)", store.ErrInvalid))
		return
	}
	phone, err := store.NormalizePhone(in.CustomerPhone)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	in.CustomerPhone = phone
	in.Source = "web"
	if r.Header.Get("X-Client") == "app" {
		in.Source = "app"
	}
	o, err := s.Store.CreateOrder(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id":           o.ID,
		"number":       o.Number,
		"track_token":  o.TrackToken,
		"subtotal":     o.Subtotal,
		"delivery_fee": o.DeliveryFee,
		"delivery_km":  o.DeliveryKm,
		"total":        o.Total,
		"status":       o.Status,
	})
}

// trackOrder is what the website polls. The token stops anyone from reading orders by guessing ids.
func (s *Server) trackOrder(w http.ResponseWriter, r *http.Request) {
	o, err := s.Store.Order(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if subtle.ConstantTimeCompare([]byte(r.URL.Query().Get("t")), []byte(o.TrackToken)) != 1 {
		writeErr(w, r, store.ErrNotFound)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, map[string]any{
		"id":             o.ID,
		"number":         o.Number,
		"status":         o.Status,
		"fulfilment":     o.Fulfilment,
		"subtotal":       o.Subtotal,
		"delivery_fee":   o.DeliveryFee,
		"total":          o.Total,
		"prep_minutes":   o.PrepMinutes,
		"ready_at":       o.ReadyAt,
		"server_time":    time.Now().UTC(),
		"customer_name":  o.CustomerName,
		"created_at":     o.CreatedAt,
		"payment_method": o.PaymentMethod,
		"payment_status": o.PaymentStatus,
		"payment_ref":    o.PaymentRef,
		"delivery_km":    o.DeliveryKm,
		"items":          o.Items,
		"events":         o.Events,
	})
}

// ---- owner ----

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	// Per account, so a changed address (X-Forwarded-For can be faked) doesn't buy more guesses.
	key := strings.ToLower(strings.TrimSpace(in.Email))
	if !s.loginLimit.Allow(key) || !s.ipLimit.Allow(clientIP(r)) {
		writeTooMany(w)
		return
	}
	token, staff, err := s.Auth.Login(r.Context(), in.Email, in.Password)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	s.loginLimit.Reset(key)
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": staff})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, staffFrom(r))
}

// ---- admin ----

func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.Store.Users(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *Server) createUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
		Role     string `json:"role"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	// Someone else picked this password, so it's temporary: the new person sets their own at first sign-in.
	u, err := s.Store.CreateUser(r.Context(), in.Email, in.Name, in.Role, hash, true)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name     *string `json:"name"`
		Role     *string `json:"role"`
		Active   *bool   `json:"active"`
		Password *string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	id := chi.URLParam(r, "id")
	if id == staffFrom(r).ID && ((in.Active != nil && !*in.Active) || (in.Role != nil && *in.Role != "admin")) {
		writeErr(w, r, fmt.Errorf("%w: you can't remove your own admin access", store.ErrInvalid))
		return
	}
	upd := store.UserUpdate{Name: in.Name, Role: in.Role, Active: in.Active}
	if in.Password != nil {
		hash, err := auth.HashPassword(*in.Password)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		upd.PasswordHash = &hash
		upd.MustChange = id != staffFrom(r).ID // a password set for someone else is temporary
	}
	u, err := s.Store.UpdateUser(r.Context(), id, upd)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (s *Server) listOrders(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	active := q.Get("status") != "all"
	since := time.Now().Add(-7 * 24 * time.Hour)
	if v := q.Get("since"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			writeErr(w, r, fmt.Errorf("%w: since must be RFC 3339", store.ErrInvalid))
			return
		}
		since = t
	}
	orders, err := s.Store.Orders(r.Context(), active, since, 200)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := s.addBadges(r.Context(), orders...); err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": orders, "server_time": time.Now().UTC()})
}

func (s *Server) getOrder(w http.ResponseWriter, r *http.Request) {
	o, err := s.Store.Order(r.Context(), chi.URLParam(r, "id"))
	if err == nil {
		err = s.addBadges(r.Context(), o)
	}
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (s *Server) updateOrder(w http.ResponseWriter, r *http.Request) {
	var in store.OrderUpdate
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	o, err := s.Store.UpdateOrder(r.Context(), chi.URLParam(r, "id"), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

func (s *Server) ownerMenu(w http.ResponseWriter, r *http.Request) {
	menu, err := s.Store.Menu(r.Context(), true)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"categories": menu})
}

func (s *Server) updateItem(w http.ResponseWriter, r *http.Request) {
	var in store.ItemUpdate
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if err := s.Store.UpdateItem(r.Context(), chi.URLParam(r, "id"), in); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) earnings(w http.ResponseWriter, r *http.Request) {
	today := time.Now().In(ist)
	from, to := today.AddDate(0, 0, -6), today
	parse := func(key string, def time.Time) (time.Time, error) {
		v := r.URL.Query().Get(key)
		if v == "" {
			return time.Date(def.Year(), def.Month(), def.Day(), 0, 0, 0, 0, ist), nil
		}
		return time.ParseInLocation("2006-01-02", v, ist)
	}
	var err error
	if from, err = parse("from", from); err == nil {
		to, err = parse("to", to)
	}
	if err != nil || to.Before(from) || to.Sub(from) > 366*24*time.Hour {
		writeErr(w, r, fmt.Errorf("%w: from/to must be YYYY-MM-DD, at most a year apart", store.ErrInvalid))
		return
	}
	e, err := s.Store.Earnings(r.Context(), from, to)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, e)
}

func errInvalid(msg string) error { return fmt.Errorf("%w: %s", store.ErrInvalid, msg) }

// paymentRef saves the UPI reference number a customer enters after paying from a UPI app.
func (s *Server) paymentRef(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token string `json:"t"`
		Ref   string `json:"ref"`
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
	if subtle.ConstantTimeCompare([]byte(in.Token), []byte(o.TrackToken)) != 1 {
		writeErr(w, r, store.ErrNotFound)
		return
	}
	if err := s.Store.SetPaymentRef(r.Context(), o.ID, in.Ref); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

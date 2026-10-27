package httpapi

import (
	"crypto/subtle"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/vikash-parashar/urban-bites/api/internal/auth"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

// ---- delivery partner ----

func (s *Server) riderOrders(w http.ResponseWriter, r *http.Request) {
	orders, err := s.Store.RiderOrders(r.Context(), staffFrom(r).ID)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"orders": orders})
}

func (s *Server) riderAction(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Action        store.RiderAction `json:"action"`
		CashCollected bool              `json:"cash_collected"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	o, err := s.Store.RiderUpdate(r.Context(), chi.URLParam(r, "id"), staffFrom(r).ID, in.Action, in.CashCollected)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

// ---- delivery partner accounts, managed by the owner ----

func (s *Server) listRiders(w http.ResponseWriter, r *http.Request) {
	users, err := s.Store.Riders(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"riders": users})
}

func (s *Server) createRider(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Name     string `json:"name"`
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
	u, err := s.Store.CreateUser(r.Context(), in.Email, in.Name, "delivery", hash, true)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

// updateRider lets the owner switch a delivery account off or on, or set a new temporary password.
func (s *Server) updateRider(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Active   *bool   `json:"active"`
		Password *string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	id := chi.URLParam(r, "id")
	target, err := s.Store.UserByID(r.Context(), id)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if target.Role != "delivery" {
		writeErr(w, r, store.ErrNotFound)
		return
	}
	upd := store.UserUpdate{Active: in.Active}
	if in.Password != nil {
		hash, err := auth.HashPassword(*in.Password)
		if err != nil {
			writeErr(w, r, err)
			return
		}
		upd.PasswordHash, upd.MustChange = &hash, true
	}
	u, err := s.Store.UpdateUser(r.Context(), id, upd)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// ---- voice notes ----

// uploadVoiceNote: the customer's phone sends the recorded note right after placing the order (?t=track token).
func (s *Server) uploadVoiceNote(w http.ResponseWriter, r *http.Request) {
	o, err := s.Store.Order(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if subtle.ConstantTimeCompare([]byte(r.URL.Query().Get("t")), []byte(o.TrackToken)) != 1 {
		writeErr(w, r, store.ErrNotFound)
		return
	}
	mime := strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])
	if !strings.HasPrefix(mime, "audio/") {
		writeErr(w, r, fmt.Errorf("%w: send an audio recording", store.ErrInvalid))
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, store.MaxVoiceNote+1))
	if err != nil {
		writeErr(w, r, fmt.Errorf("%w: voice note must be under a minute", store.ErrInvalid))
		return
	}
	if err := s.Store.SaveVoiceNote(r.Context(), o.ID, r.Header.Get("Content-Type"), data); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) voiceNote(w http.ResponseWriter, r *http.Request) {
	mime, data, err := s.Store.VoiceNote(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Write(data)
}

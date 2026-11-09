package httpapi

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

// liveAds: GET /v1/ads?place=home|tracker|staff. Public; each call counts a view.
func (s *Server) liveAds(w http.ResponseWriter, r *http.Request) {
	ads, err := s.Store.LiveAds(r.Context(), r.URL.Query().Get("place"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ads": ads})
}

func (s *Server) adImage(w http.ResponseWriter, r *http.Request) {
	img, typ, err := s.Store.AdImage(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	w.Header().Set("Content-Type", typ)
	w.Header().Set("Content-Length", strconv.Itoa(len(img)))
	w.Header().Set("Cache-Control", "public, max-age=86400") // the page adds ?v=updated_at, so a new photo shows at once
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(img)
}

func (s *Server) adClick(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.AdClicked(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) allAds(w http.ResponseWriter, r *http.Request) {
	ads, err := s.Store.AllAds(r.Context())
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ads": ads})
}

func (s *Server) createAd(w http.ResponseWriter, r *http.Request) {
	var in store.AdInput
	if err := decodeMax(r, &in, 600<<10); err != nil {
		writeErr(w, r, err)
		return
	}
	a, err := s.Store.CreateAd(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *Server) updateAd(w http.ResponseWriter, r *http.Request) {
	var in store.AdInput
	if err := decodeMax(r, &in, 600<<10); err != nil {
		writeErr(w, r, err)
		return
	}
	a, err := s.Store.UpdateAd(r.Context(), chi.URLParam(r, "id"), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *Server) deleteAd(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteAd(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

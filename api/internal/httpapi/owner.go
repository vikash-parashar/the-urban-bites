package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/vikash-parashar/urban-bites/api/internal/auth"
	"github.com/vikash-parashar/urban-bites/api/internal/mail"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

// ---- menu: add, delete, new section ----

func (s *Server) createItem(w http.ResponseWriter, r *http.Request) {
	var in store.ItemUpdate
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	it, err := s.Store.CreateItem(r.Context(), in)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, it)
}

func (s *Server) deleteItem(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteItem(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name   string `json:"name"`
		NameHi string `json:"name_hi"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	c, err := s.Store.CreateCategory(r.Context(), in.Name, in.NameHi)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

// ---- dashboard ----

// periodRange turns period + date into IST calendar dates and the chart bucket.
// The current period stops at today, so "this month" compares fairly with the days just before it.
func periodRange(period, date string, now time.Time) (from, to time.Time, bucket string, err error) {
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, ist)
	day := today
	if date != "" {
		if day, err = time.ParseInLocation("2006-01-02", date, ist); err != nil {
			return from, to, "", errInvalid("date must be YYYY-MM-DD")
		}
	}
	switch period {
	case "", "day":
		from, to, bucket = day, day, "hour"
	case "week": // Monday to Sunday
		from = day.AddDate(0, 0, -((int(day.Weekday()) + 6) % 7))
		to, bucket = from.AddDate(0, 0, 6), "day"
	case "month":
		from = time.Date(day.Year(), day.Month(), 1, 0, 0, 0, 0, ist)
		to, bucket = from.AddDate(0, 1, -1), "day"
	case "year":
		from = time.Date(day.Year(), 1, 1, 0, 0, 0, 0, ist)
		to, bucket = from.AddDate(1, 0, -1), "month"
	default:
		return from, to, "", errInvalid("period must be day, week, month or year")
	}
	if from.After(today) {
		return from, to, "", errInvalid("that date is in the future")
	}
	if to.After(today) {
		to = today
	}
	return from, to, bucket, nil
}

func (s *Server) dashboard(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	period := q.Get("period")
	if period == "" {
		period = "day"
	}
	from, to, bucket, err := periodRange(period, q.Get("date"), time.Now().In(ist))
	if err != nil {
		writeErr(w, r, err)
		return
	}
	d, err := s.Store.DashboardFor(r.Context(), period, from, to, bucket)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// ---- expenses ----

func (s *Server) listExpenses(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from, to, _, err := periodRange(q.Get("period"), q.Get("date"), time.Now().In(ist))
	if q.Get("period") == "" {
		from, to, _, err = periodRange("month", q.Get("date"), time.Now().In(ist))
	}
	if err != nil {
		writeErr(w, r, err)
		return
	}
	list, err := s.Store.Expenses(r.Context(), from, to)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	total := 0
	for _, e := range list {
		total += e.Amount
	}
	writeJSON(w, http.StatusOK, map[string]any{"expenses": list, "total": total, "categories": store.ExpenseCategories,
		"from": from.Format("2006-01-02"), "to": to.Format("2006-01-02")})
}

func (s *Server) addExpense(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SpentOn  string `json:"spent_on"`
		Category string `json:"category"`
		Amount   int    `json:"amount"`
		Note     string `json:"note"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if in.SpentOn == "" {
		in.SpentOn = time.Now().In(ist).Format("2006-01-02")
	}
	e, err := s.Store.AddExpense(r.Context(), staffFrom(r).ID, store.Expense{SpentOn: in.SpentOn, Category: in.Category, Amount: in.Amount, Note: in.Note})
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, e)
}

func (s *Server) deleteExpense(w http.ResponseWriter, r *http.Request) {
	if err := s.Store.DeleteExpense(r.Context(), chi.URLParam(r, "id")); err != nil {
		writeErr(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- passwords ----

// changePassword lets a signed-in person replace their password (required after a temporary one).
// It returns a fresh token, because changing the password signs out every older session.
func (s *Server) changePassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	me := staffFrom(r)
	if !s.loginLimit.Allow("pw:" + me.ID) {
		writeTooMany(w)
		return
	}
	if _, err := s.Auth.CheckPassword(r.Context(), me.ID, in.Current); err != nil {
		writeErr(w, r, err)
		return
	}
	if in.New == in.Current {
		writeErr(w, r, auth.ErrSamePassword)
		return
	}
	if err := checkStrong(in.New, me.Email); err != nil {
		writeErr(w, r, err)
		return
	}
	hash, err := auth.HashPassword(in.New)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	u, err := s.Store.SetOwnPassword(r.Context(), me.ID, hash)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	s.loginLimit.Reset("pw:" + me.ID)
	s.sessionAfterPassword(w, r, u)
}

func (s *Server) sessionAfterPassword(w http.ResponseWriter, r *http.Request, u *store.User) {
	// The new token's issue time must not be before the change, which is stored to the second.
	token, err := s.Auth.Issue(u)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token,
		"user": auth.Staff{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role}})
}

// checkStrong refuses passwords that are easy to guess. Length is checked by auth.HashPassword.
func checkStrong(pw, email string) error {
	low := strings.ToLower(pw)
	local, _, _ := strings.Cut(strings.ToLower(email), "@")
	for _, bad := range []string{"urban", "bites", "1234567", "password", "qwerty", "demo"} {
		if strings.Contains(low, bad) {
			return errInvalid("that password is too easy to guess; avoid the shop name, \"demo\" and number runs")
		}
	}
	if len(local) >= 4 && strings.Contains(low, local) {
		return errInvalid("don't use your email in your password")
	}
	return nil
}

const resetTTL = 30 * time.Minute

func hashToken(t string) string {
	sum := sha256.Sum256([]byte(t))
	return hex.EncodeToString(sum[:])
}

// forgotPassword emails a one-time link. It always answers 204, so it never reveals whether an email
// belongs to a staff account, and the email is sent in the background so timing doesn't either.
func (s *Server) forgotPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email string `json:"email"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if !s.forgotLimit.Allow("ip:" + clientIP(r)) {
		writeTooMany(w)
		return
	}
	email := strings.TrimSpace(in.Email)
	go s.sendReset(context.WithoutCancel(r.Context()), email)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) sendReset(ctx context.Context, email string) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	u, err := s.Store.UserByEmail(ctx, email)
	if err != nil || !u.Active {
		return
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		slog.ErrorContext(ctx, "reset token", "err", err)
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if err := s.Store.CreatePasswordReset(ctx, u.ID, hashToken(token), resetTTL); err != nil {
		if !errors.Is(err, store.ErrTooMany) {
			slog.ErrorContext(ctx, "save reset token", "err", err)
		}
		return
	}
	link := strings.TrimRight(s.SiteURL, "/") + "/#staff/reset?token=" + token
	name := u.Name
	text := fmt.Sprintf("Namaste %s,\n\nSomeone (hopefully you) asked to reset the password for The Urban Bites staff area.\n\n"+
		"Open this link within 30 minutes to choose a new password:\n%s\n\n"+
		"If you didn't ask for this, ignore this email; your password stays the same.\n\nThe Urban Bites", name, link)
	htmlBody := fmt.Sprintf(`<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#222">
<h2 style="color:#b8741a">The Urban Bites</h2>
<p>Namaste %s,</p>
<p>Someone (hopefully you) asked to reset the password for The Urban Bites staff area.</p>
<p><a href="%s" style="display:inline-block;background:#e0a526;color:#1a1208;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Choose a new password</a></p>
<p style="font-size:13px;color:#666">The link works once, for 30 minutes. If you didn't ask for this, ignore this email; your password stays the same.</p>
</div>`, html.EscapeString(name), html.EscapeString(link))
	if err := s.Mail.Send(ctx, mail.Message{ToEmail: u.Email, ToName: name, Subject: "Reset your The Urban Bites password", Text: text, HTML: htmlBody}); err != nil {
		slog.ErrorContext(ctx, "send reset email", "err", err)
	}
}

func (s *Server) resetPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if err := decode(r, &in); err != nil {
		writeErr(w, r, err)
		return
	}
	if !s.forgotLimit.Allow("reset:" + clientIP(r)) {
		writeTooMany(w)
		return
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		writeErr(w, r, err)
		return
	}
	if len(in.Token) < 40 || len(in.Token) > 64 {
		writeErr(w, r, errInvalid("this reset link is not valid or has expired; ask for a new one"))
		return
	}
	bad := errInvalid("this reset link is not valid or has expired; ask for a new one")
	th := hashToken(in.Token)
	owner, err := s.Store.PasswordResetUser(r.Context(), th)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, r, bad)
		return
	} else if err != nil {
		writeErr(w, r, err)
		return
	}
	if err := checkStrong(in.Password, owner.Email); err != nil {
		writeErr(w, r, err)
		return
	}
	u, err := s.Store.UsePasswordReset(r.Context(), th, hash)
	if errors.Is(err, store.ErrNotFound) {
		err = bad
	}
	if err != nil {
		writeErr(w, r, err)
		return
	}
	s.sessionAfterPassword(w, r, u)
}

func clientIP(r *http.Request) string {
	ip := r.RemoteAddr
	if i := strings.LastIndex(ip, ":"); i > 0 && !strings.Contains(ip[i:], "]") {
		ip = ip[:i]
	}
	return ip
}

func writeTooMany(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "900")
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "too many tries; wait 15 minutes and try again"})
}

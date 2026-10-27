// Package auth signs in staff (admin and owner) and issues JWTs for the app and website.
//
// Customers don't need accounts: they track an order with the private token returned when they place it.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

var (
	ErrBadCredentials = errors.New("wrong email or password")
	ErrWeakPassword   = errors.New("password must be at least 10 characters")
	ErrWrongCurrent   = errors.New("your current password is not right")
	ErrSamePassword   = errors.New("pick a new password, not the one you have now")
)

// A hash compared when the email is unknown, so a wrong email takes as long as a wrong password.
var dummyHash = sync.OnceValue(func() []byte {
	h, _ := bcrypt.GenerateFromPassword([]byte("not-a-real-account"), 12)
	return h
})

type Staff struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
	// MustChangePassword: signed in with a temporary password, so only the change-password call works.
	MustChangePassword bool `json:"must_change_password"`
}

func staffOf(u *store.User) *Staff {
	return &Staff{ID: u.ID, Email: u.Email, Name: u.Name, Role: u.Role, MustChangePassword: u.MustChangePassword}
}

type Claims struct {
	jwt.RegisteredClaims
	Name string `json:"name"`
	Role string `json:"role"`
}

type Service struct {
	Store  *store.Store
	Secret []byte
	TTL    time.Duration // fallback; each role has its own below
}

// TTLFor is how long a session lasts without being used. Every use renews it (see RenewAfter), so the
// owner's tablet and the riders' phones stay signed in while they work, and the admin is signed out
// after half a day away.
func (a *Service) TTLFor(role string) time.Duration {
	switch role {
	case "admin":
		return 12 * time.Hour
	case "owner":
		return 60 * 24 * time.Hour
	case "delivery":
		return 30 * 24 * time.Hour
	}
	if a.TTL > 0 {
		return a.TTL
	}
	return 24 * time.Hour
}

// RenewAfter: a token older than this gets a fresh one on the next request.
func RenewAfter(role string) time.Duration {
	if role == "admin" {
		return 30 * time.Minute
	}
	return 24 * time.Hour
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func HashPassword(pw string) (string, error) {
	if len([]rune(pw)) < 10 {
		return "", ErrWeakPassword
	}
	if len(pw) > 72 { // bcrypt ignores anything past 72 bytes
		return "", errors.New("password can be at most 72 characters")
	}
	h, err := bcrypt.GenerateFromPassword([]byte(pw), 12)
	return string(h), err
}

func (a *Service) Login(ctx context.Context, email, password string) (string, *Staff, error) {
	u, err := a.Store.UserByEmail(ctx, email)
	if errors.Is(err, store.ErrNotFound) {
		_ = bcrypt.CompareHashAndPassword(dummyHash(), []byte(password))
		return "", nil, ErrBadCredentials
	} else if err != nil {
		return "", nil, err
	}
	if !u.Active || bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return "", nil, ErrBadCredentials
	}
	a.Store.TouchLogin(ctx, u.ID)
	token, err := a.Issue(u)
	return token, staffOf(u), err
}

// Issue signs a session token for a user, e.g. right after they set a new password.
func (a *Service) Issue(u *store.User) (string, error) {
	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        newID(),
			Subject:   u.ID,
			Audience:  jwt.ClaimStrings{"staff"},
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(a.TTLFor(u.Role))),
		},
		Name: u.Name,
		Role: u.Role,
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(a.Secret)
}

// CheckPassword confirms a signed-in person's current password before they change it.
func (a *Service) CheckPassword(ctx context.Context, id, password string) (*store.User, error) {
	u, err := a.Store.UserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(password)) != nil {
		return nil, ErrWrongCurrent
	}
	return u, nil
}

// Verify checks the token and that the account is still active, so deactivating someone signs them out.
func (a *Service) Verify(ctx context.Context, token string) (*Staff, error) {
	st, _, _, err := a.VerifySession(ctx, token)
	return st, err
}

// VerifySession is Verify plus the session details, so the caller can renew or revoke it.
// It returns a fresh token when this one is due for renewal ("" otherwise).
func (a *Service) VerifySession(ctx context.Context, token string) (*Staff, *Claims, string, error) {
	var c Claims
	_, err := jwt.ParseWithClaims(token, &c, func(*jwt.Token) (any, error) { return a.Secret, nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithAudience("staff"))
	if err != nil {
		return nil, nil, "", err
	}
	u, err := a.Store.UserByID(ctx, c.Subject)
	if err != nil {
		return nil, nil, "", err
	}
	if !u.Active {
		return nil, nil, "", errors.New("account disabled")
	}
	// Tokens from before the last password change or "sign out everywhere" no longer work.
	if c.IssuedAt == nil || c.IssuedAt.Time.Before(u.PasswordChangedAt) || c.IssuedAt.Time.Before(u.SignedOutAt) {
		return nil, nil, "", errors.New("signed out")
	}
	if revoked, err := a.Store.SessionRevoked(ctx, c.ID); err != nil {
		return nil, nil, "", err
	} else if revoked {
		return nil, nil, "", errors.New("signed out on this device")
	}
	// The role always comes from the database, never from the token, so a changed role applies at once.
	fresh := ""
	if time.Since(c.IssuedAt.Time) > RenewAfter(u.Role) {
		if t, err := a.Issue(u); err == nil {
			fresh = t
		}
	}
	return staffOf(u), &c, fresh, nil
}

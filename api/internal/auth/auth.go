// Package auth signs in staff (admin and owner) and issues JWTs for the app and website.
//
// Customers don't need accounts: they track an order with the private token returned when they place it.
package auth

import (
	"context"
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
	TTL    time.Duration
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
			Subject:   u.ID,
			Audience:  jwt.ClaimStrings{"staff"},
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(a.TTL)),
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
	var c Claims
	_, err := jwt.ParseWithClaims(token, &c, func(*jwt.Token) (any, error) { return a.Secret, nil },
		jwt.WithValidMethods([]string{"HS256"}), jwt.WithAudience("staff"))
	if err != nil {
		return nil, err
	}
	u, err := a.Store.UserByID(ctx, c.Subject)
	if err != nil {
		return nil, err
	}
	if !u.Active {
		return nil, errors.New("account disabled")
	}
	// Tokens from before the last password change no longer work.
	if c.IssuedAt == nil || c.IssuedAt.Time.Before(u.PasswordChangedAt) {
		return nil, errors.New("signed out after a password change")
	}
	return staffOf(u), nil
}

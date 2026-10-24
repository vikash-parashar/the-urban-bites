package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var ErrDuplicate = errors.New("already exists")

type User struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	Name         string     `json:"name"`
	Role         string     `json:"role"`
	Active       bool       `json:"active"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	PasswordHash string     `json:"-"`
}

const userCols = `id, email, name, role, active, created_at, last_login_at, password_hash`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Active, &u.CreatedAt, &u.LastLoginAt, &u.PasswordHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return &u, err
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE lower(email) = lower($1)`, strings.TrimSpace(email)))
}

func (s *Store) UserByID(ctx context.Context, id string) (*User, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	return scanUser(s.db.QueryRow(ctx, `SELECT `+userCols+` FROM users WHERE id = $1`, id))
}

func (s *Store) Users(ctx context.Context) ([]*User, error) {
	rows, err := s.db.Query(ctx, `SELECT `+userCols+` FROM users ORDER BY role, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []*User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) CreateUser(ctx context.Context, email, name, role, passwordHash string) (*User, error) {
	if role != "admin" && role != "owner" {
		return nil, fmt.Errorf("%w: role must be admin or owner", ErrInvalid)
	}
	if !strings.Contains(email, "@") || strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("%w: email and name are required", ErrInvalid)
	}
	u, err := scanUser(s.db.QueryRow(ctx, `
		INSERT INTO users (email, name, role, password_hash) VALUES ($1, $2, $3, $4)
		RETURNING `+userCols, strings.TrimSpace(email), strings.TrimSpace(name), role, passwordHash))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, fmt.Errorf("%w: a staff account with that email", ErrDuplicate)
	}
	return u, err
}

type UserUpdate struct {
	Name         *string
	Role         *string
	Active       *bool
	PasswordHash *string
}

func (s *Store) UpdateUser(ctx context.Context, id string, u UserUpdate) (*User, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	if u.Role != nil && *u.Role != "admin" && *u.Role != "owner" {
		return nil, fmt.Errorf("%w: role must be admin or owner", ErrInvalid)
	}
	return scanUser(s.db.QueryRow(ctx, `
		UPDATE users SET
			name = COALESCE($2, name),
			role = COALESCE($3, role),
			active = COALESCE($4, active),
			password_hash = COALESCE($5, password_hash)
		WHERE id = $1
		RETURNING `+userCols, id, u.Name, u.Role, u.Active, u.PasswordHash))
}

func (s *Store) TouchLogin(ctx context.Context, id string) {
	_, _ = s.db.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id)
}

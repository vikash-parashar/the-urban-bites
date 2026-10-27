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
	ID          string     `json:"id"`
	Email       string     `json:"email"`
	Name        string     `json:"name"`
	Role        string     `json:"role"`
	Active      bool       `json:"active"`
	CreatedAt   time.Time  `json:"created_at"`
	LastLoginAt *time.Time `json:"last_login_at"`
	// MustChangePassword is set for a temporary password; the person picks their own before anything else.
	MustChangePassword bool      `json:"must_change_password"`
	PasswordChangedAt  time.Time `json:"-"`
	PasswordHash       string    `json:"-"`
}

const userCols = `id, email, name, role, active, created_at, last_login_at, must_change_password, password_changed_at, password_hash`

func scanUser(row pgx.Row) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.Active, &u.CreatedAt, &u.LastLoginAt, &u.MustChangePassword, &u.PasswordChangedAt, &u.PasswordHash)
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

// CreateUser adds a staff account. With mustChange, the password is temporary and must be replaced on first sign-in.
func (s *Store) CreateUser(ctx context.Context, email, name, role, passwordHash string, mustChange bool) (*User, error) {
	if !ValidRole(role) {
		return nil, fmt.Errorf("%w: role must be admin, owner or delivery", ErrInvalid)
	}
	if !strings.Contains(email, "@") || strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("%w: email and name are required", ErrInvalid)
	}
	u, err := scanUser(s.db.QueryRow(ctx, `
		INSERT INTO users (email, name, role, password_hash, must_change_password, password_changed_at)
		VALUES ($1, $2, $3, $4, $5, date_trunc('second', now()))
		RETURNING `+userCols, strings.TrimSpace(email), strings.TrimSpace(name), role, passwordHash, mustChange))
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return nil, fmt.Errorf("%w: a staff account with that email", ErrDuplicate)
	}
	return u, err
}

// ValidRole: admin (everything), owner (runs the day) or delivery (delivers orders).
func ValidRole(r string) bool { return r == "admin" || r == "owner" || r == "delivery" }

type UserUpdate struct {
	Name         *string
	Role         *string
	Active       *bool
	PasswordHash *string
	// MustChange applies with PasswordHash: true when someone else set a temporary password.
	MustChange bool
}

func (s *Store) UpdateUser(ctx context.Context, id string, u UserUpdate) (*User, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	if u.Role != nil && !ValidRole(*u.Role) {
		return nil, fmt.Errorf("%w: role must be admin, owner or delivery", ErrInvalid)
	}
	return scanUser(s.db.QueryRow(ctx, `
		UPDATE users SET
			name = COALESCE($2, name),
			role = COALESCE($3, role),
			active = COALESCE($4, active),
			password_hash = COALESCE($5, password_hash),
			must_change_password = CASE WHEN $5::text IS NULL THEN must_change_password ELSE $6 END,
			-- A new password signs out every device that used the old one.
			password_changed_at = CASE WHEN $5::text IS NULL THEN password_changed_at ELSE date_trunc('second', now()) END
		WHERE id = $1
		RETURNING `+userCols, id, u.Name, u.Role, u.Active, u.PasswordHash, u.MustChange))
}

func (s *Store) TouchLogin(ctx context.Context, id string) {
	_, _ = s.db.Exec(ctx, `UPDATE users SET last_login_at = now() WHERE id = $1`, id)
}

// SetOwnPassword saves a password the person chose, clears the temporary flag and signs out other devices.
func (s *Store) SetOwnPassword(ctx context.Context, id, passwordHash string) (*User, error) {
	return s.UpdateUser(ctx, id, UserUpdate{PasswordHash: &passwordHash})
}

// ---- forgot password ----

// ErrTooMany means too many reset emails were asked for; the caller still answers as if one was sent.
var ErrTooMany = errors.New("too many requests")

// CreatePasswordReset stores the hash of a one-time reset token. At most 3 links per account per hour.
func (s *Store) CreatePasswordReset(ctx context.Context, userID, tokenHash string, ttl time.Duration) error {
	var recent int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
		userID).Scan(&recent); err != nil {
		return err
	}
	if recent >= 3 {
		return ErrTooMany
	}
	_, err := s.db.Exec(ctx, `INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3::interval)`,
		tokenHash, userID, fmt.Sprintf("%d seconds", int(ttl.Seconds())))
	if err == nil {
		_, _ = s.db.Exec(ctx, `DELETE FROM password_resets WHERE expires_at < now() - interval '7 days'`)
	}
	return err
}

// PasswordResetUser finds the account a valid, unused reset link belongs to, without spending it.
func (s *Store) PasswordResetUser(ctx context.Context, tokenHash string) (*User, error) {
	return scanUser(s.db.QueryRow(ctx, `SELECT `+prefixed("u.")+` FROM password_resets r JOIN users u ON u.id = r.user_id
		WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() AND u.active`, tokenHash))
}

func prefixed(p string) string {
	cols := strings.Split(userCols, ", ")
	for i := range cols {
		cols[i] = p + cols[i]
	}
	return strings.Join(cols, ", ")
}

// UsePasswordReset sets a new password if the token is valid, unused and not expired, then spends every
// open link for that account. It returns ErrNotFound for any bad link, without saying why.
func (s *Store) UsePasswordReset(ctx context.Context, tokenHash, passwordHash string) (*User, error) {
	var u *User
	err := pgx.BeginFunc(ctx, s.db, func(tx pgx.Tx) error {
		var userID string
		err := tx.QueryRow(ctx, `
			SELECT r.user_id FROM password_resets r JOIN users u ON u.id = r.user_id
			WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now() AND u.active
			FOR UPDATE OF r`, tokenHash).Scan(&userID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		} else if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, userID); err != nil {
			return err
		}
		u, err = scanUser(tx.QueryRow(ctx, `
			UPDATE users SET password_hash = $2, must_change_password = false, password_changed_at = date_trunc('second', now())
			WHERE id = $1 RETURNING `+userCols, userID, passwordHash))
		return err
	})
	return u, err
}

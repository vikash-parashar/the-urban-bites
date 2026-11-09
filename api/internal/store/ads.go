package store

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// MaxAdImage keeps banner photos small enough for cheap phones and the free database.
const MaxAdImage = 400 << 10

var adPlaces = map[string]bool{"home": true, "tracker": true, "staff": true}

// Ad is a sponsor banner. HasImage tells the page to load /v1/ads/{id}/image.
type Ad struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	CTA       string    `json:"cta"`
	LinkURL   string    `json:"link_url"`
	Phone     string    `json:"phone"`
	Place     string    `json:"place"`
	Active    bool      `json:"active"`
	StartsOn  *string   `json:"starts_on"`
	EndsOn    *string   `json:"ends_on"`
	Sort      int       `json:"sort"`
	HasImage  bool      `json:"has_image"`
	Views     int64     `json:"views"`
	Clicks    int64     `json:"clicks"`
	UpdatedAt time.Time `json:"updated_at"`
}

// AdInput is what the admin sends. Image is a data URL ("data:image/jpeg;base64,..."); "" keeps the
// current photo and "remove" deletes it.
type AdInput struct {
	Title    string  `json:"title"`
	Body     string  `json:"body"`
	CTA      string  `json:"cta"`
	LinkURL  string  `json:"link_url"`
	Phone    string  `json:"phone"`
	Place    string  `json:"place"`
	Active   *bool   `json:"active"`
	StartsOn *string `json:"starts_on"`
	EndsOn   *string `json:"ends_on"`
	Sort     int     `json:"sort"`
	Image    string  `json:"image"`
}

func (in *AdInput) normalise() (img []byte, imgType string, err error) {
	in.Title, in.Body, in.CTA = strings.TrimSpace(in.Title), strings.TrimSpace(in.Body), strings.TrimSpace(in.CTA)
	in.LinkURL, in.Phone = strings.TrimSpace(in.LinkURL), strings.TrimSpace(in.Phone)
	if in.Title == "" || len(in.Title) > 80 || len(in.Body) > 200 || len(in.CTA) > 24 {
		return nil, "", fmt.Errorf("%w: title (up to 80 characters) is required; text up to 200, button up to 24", ErrInvalid)
	}
	if !adPlaces[in.Place] {
		return nil, "", fmt.Errorf("%w: place must be home, tracker or staff", ErrInvalid)
	}
	if in.LinkURL != "" {
		u, err := url.Parse(in.LinkURL)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" || len(in.LinkURL) > 500 {
			return nil, "", fmt.Errorf("%w: link must be a full web address starting with https://", ErrInvalid)
		}
	}
	if in.Phone != "" {
		p, err := NormalizePhone(in.Phone)
		if err != nil {
			return nil, "", err
		}
		in.Phone = p
	}
	for _, d := range []*string{in.StartsOn, in.EndsOn} {
		if d != nil && *d != "" {
			if _, err := time.Parse("2006-01-02", *d); err != nil {
				return nil, "", fmt.Errorf("%w: dates look like 2026-11-30", ErrInvalid)
			}
		}
	}
	if in.StartsOn != nil && *in.StartsOn == "" {
		in.StartsOn = nil
	}
	if in.EndsOn != nil && *in.EndsOn == "" {
		in.EndsOn = nil
	}
	if in.Image == "" || in.Image == "remove" {
		return nil, "", nil
	}
	head, data, ok := strings.Cut(in.Image, ",")
	mime := strings.TrimSuffix(strings.TrimPrefix(head, "data:"), ";base64")
	if !ok || !strings.HasSuffix(head, ";base64") || (mime != "image/jpeg" && mime != "image/png" && mime != "image/webp") {
		return nil, "", fmt.Errorf("%w: photo must be JPG, PNG or WebP", ErrInvalid)
	}
	raw, err := base64.StdEncoding.DecodeString(data)
	if err != nil || len(raw) == 0 {
		return nil, "", fmt.Errorf("%w: couldn't read the photo", ErrInvalid)
	}
	if len(raw) > MaxAdImage {
		return nil, "", fmt.Errorf("%w: photo must be under 400 KB", ErrInvalid)
	}
	return raw, mime, nil
}

const adCols = `id, title, body, cta, link_url, phone, place, active, to_char(starts_on, 'YYYY-MM-DD'), to_char(ends_on, 'YYYY-MM-DD'),
	sort, image IS NOT NULL, views, clicks, updated_at`

func scanAds(rows pgx.Rows) ([]Ad, error) {
	defer rows.Close()
	ads := []Ad{}
	for rows.Next() {
		var a Ad
		if err := rows.Scan(&a.ID, &a.Title, &a.Body, &a.CTA, &a.LinkURL, &a.Phone, &a.Place, &a.Active, &a.StartsOn, &a.EndsOn,
			&a.Sort, &a.HasImage, &a.Views, &a.Clicks, &a.UpdatedAt); err != nil {
			return nil, err
		}
		ads = append(ads, a)
	}
	return ads, rows.Err()
}

// LiveAds returns the ads running today in one place, and counts a view for each.
func (s *Store) LiveAds(ctx context.Context, place string) ([]Ad, error) {
	if !adPlaces[place] {
		return nil, fmt.Errorf("%w: unknown ad place", ErrInvalid)
	}
	rows, err := s.db.Query(ctx, `UPDATE ads SET views = views + 1
		WHERE place = $1 AND active AND (starts_on IS NULL OR starts_on <= $2::date) AND (ends_on IS NULL OR ends_on >= $2::date)
		RETURNING `+adCols, place, today())
	if err != nil {
		return nil, err
	}
	ads, err := scanAds(rows)
	if err != nil {
		return nil, err
	}
	// Lowest sort first, newest first after that.
	for i := 1; i < len(ads); i++ {
		for j := i; j > 0 && (ads[j].Sort < ads[j-1].Sort || (ads[j].Sort == ads[j-1].Sort && ads[j].UpdatedAt.After(ads[j-1].UpdatedAt))); j-- {
			ads[j], ads[j-1] = ads[j-1], ads[j]
		}
	}
	return ads, nil
}

func (s *Store) AllAds(ctx context.Context) ([]Ad, error) {
	rows, err := s.db.Query(ctx, `SELECT `+adCols+` FROM ads ORDER BY active DESC, place, sort, updated_at DESC`)
	if err != nil {
		return nil, err
	}
	return scanAds(rows)
}

func (s *Store) CreateAd(ctx context.Context, in AdInput) (*Ad, error) {
	img, imgType, err := in.normalise()
	if err != nil {
		return nil, err
	}
	active := in.Active == nil || *in.Active
	rows, err := s.db.Query(ctx, `INSERT INTO ads (title, body, cta, link_url, phone, place, active, starts_on, ends_on, sort, image, image_type)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING `+adCols,
		in.Title, in.Body, in.CTA, in.LinkURL, in.Phone, in.Place, active, in.StartsOn, in.EndsOn, in.Sort, img, imgType)
	if err != nil {
		return nil, err
	}
	ads, err := scanAds(rows)
	if err != nil || len(ads) == 0 {
		return nil, err
	}
	return &ads[0], nil
}

func (s *Store) UpdateAd(ctx context.Context, id string, in AdInput) (*Ad, error) {
	if !uuidRe.MatchString(id) {
		return nil, ErrNotFound
	}
	img, imgType, err := in.normalise()
	if err != nil {
		return nil, err
	}
	active := in.Active == nil || *in.Active
	rows, err := s.db.Query(ctx, `UPDATE ads SET title = $2, body = $3, cta = $4, link_url = $5, phone = $6, place = $7, active = $8,
		starts_on = $9, ends_on = $10, sort = $11,
		image = CASE WHEN $13 = 'remove' THEN NULL WHEN $12::bytea IS NULL THEN image ELSE $12 END,
		image_type = CASE WHEN $13 = 'remove' THEN '' WHEN $12::bytea IS NULL THEN image_type ELSE $14 END,
		updated_at = now()
		WHERE id = $1 RETURNING `+adCols,
		id, in.Title, in.Body, in.CTA, in.LinkURL, in.Phone, in.Place, active, in.StartsOn, in.EndsOn, in.Sort, img, in.Image, imgType)
	if err != nil {
		return nil, err
	}
	ads, err := scanAds(rows)
	if err != nil {
		return nil, err
	}
	if len(ads) == 0 {
		return nil, ErrNotFound
	}
	return &ads[0], nil
}

func (s *Store) DeleteAd(ctx context.Context, id string) error {
	if !uuidRe.MatchString(id) {
		return ErrNotFound
	}
	tag, err := s.db.Exec(ctx, `DELETE FROM ads WHERE id = $1`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return err
}

// AdImage returns the banner photo of an ad that is switched on (admins preview through the same route).
func (s *Store) AdImage(ctx context.Context, id string) ([]byte, string, error) {
	if !uuidRe.MatchString(id) {
		return nil, "", ErrNotFound
	}
	var img []byte
	var typ string
	err := s.db.QueryRow(ctx, `SELECT image, image_type FROM ads WHERE id = $1 AND image IS NOT NULL`, id).Scan(&img, &typ)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	return img, typ, err
}

// AdClicked counts a tap and returns where it should go.
func (s *Store) AdClicked(ctx context.Context, id string) error {
	if !uuidRe.MatchString(id) {
		return ErrNotFound
	}
	_, err := s.db.Exec(ctx, `UPDATE ads SET clicks = clicks + 1 WHERE id = $1 AND active`, id)
	return err
}

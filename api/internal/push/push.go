// Package push sends phone notifications through Firebase Cloud Messaging (HTTP v1), so the app
// rings for a new order even when it is closed. It needs one env var, FIREBASE_SERVICE_ACCOUNT: the
// service-account JSON from the Firebase console (raw or base64). Without it, pushes are skipped.
package push

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Android notification channels, created by the app. "orders" is loud (new order bell), "updates" is normal.
const (
	ChannelOrders  = "orders"
	ChannelUpdates = "updates"
)

type Message struct {
	Title   string
	Body    string
	Channel string
	// Open is the page the app opens when the notification is tapped, e.g. "#staff".
	Open string
	// Tag replaces an older notification with the same tag (one per order).
	Tag string
}

// ErrDeadToken: the app was uninstalled or the token expired; forget it.
var ErrDeadToken = errors.New("push token no longer valid")

type Sender struct {
	projectID   string
	clientEmail string
	key         *rsa.PrivateKey
	tokenURL    string
	fcmURL      string
	client      *http.Client

	mu     sync.Mutex
	access string
	expiry time.Time
}

// New returns nil (pushes off) when credentials is empty.
func New(credentials string) (*Sender, error) {
	credentials = strings.TrimSpace(credentials)
	if credentials == "" {
		return nil, nil
	}
	if !strings.HasPrefix(credentials, "{") {
		raw, err := base64.StdEncoding.DecodeString(credentials)
		if err != nil {
			return nil, fmt.Errorf("FIREBASE_SERVICE_ACCOUNT is neither JSON nor base64")
		}
		credentials = string(raw)
	}
	var sa struct {
		ProjectID   string `json:"project_id"`
		ClientEmail string `json:"client_email"`
		PrivateKey  string `json:"private_key"`
		TokenURI    string `json:"token_uri"`
	}
	if err := json.Unmarshal([]byte(credentials), &sa); err != nil {
		return nil, fmt.Errorf("FIREBASE_SERVICE_ACCOUNT: %w", err)
	}
	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(sa.PrivateKey))
	if err != nil {
		return nil, fmt.Errorf("FIREBASE_SERVICE_ACCOUNT private_key: %w", err)
	}
	if sa.ProjectID == "" || sa.ClientEmail == "" {
		return nil, fmt.Errorf("FIREBASE_SERVICE_ACCOUNT: project_id or client_email missing")
	}
	if sa.TokenURI == "" {
		sa.TokenURI = "https://oauth2.googleapis.com/token"
	}
	return &Sender{projectID: sa.ProjectID, clientEmail: sa.ClientEmail, key: key, tokenURL: sa.TokenURI,
		fcmURL: "https://fcm.googleapis.com/v1/projects/" + sa.ProjectID + "/messages:send",
		client: &http.Client{Timeout: 10 * time.Second}}, nil
}

func (s *Sender) Enabled() bool { return s != nil }

// accessToken trades a signed JWT for a one-hour Google access token, cached until near expiry.
func (s *Sender) accessToken(ctx context.Context) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.access != "" && time.Until(s.expiry) > 5*time.Minute {
		return s.access, nil
	}
	now := time.Now()
	assertion, err := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"iss":   s.clientEmail,
		"scope": "https://www.googleapis.com/auth/firebase.messaging",
		"aud":   s.tokenURL,
		"iat":   now.Unix(),
		"exp":   now.Add(time.Hour).Unix(),
	}).SignedString(s.key)
	if err != nil {
		return "", err
	}
	form := url.Values{"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"}, "assertion": {assertion}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, s.tokenURL, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	var out struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if res.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 500))
		return "", fmt.Errorf("google token: %s: %s", res.Status, b)
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	s.access, s.expiry = out.AccessToken, now.Add(time.Duration(out.ExpiresIn)*time.Second)
	return s.access, nil
}

// Send delivers one message to one phone.
func (s *Sender) Send(ctx context.Context, token string, m Message) error {
	access, err := s.accessToken(ctx)
	if err != nil {
		return err
	}
	channel := m.Channel
	if channel == "" {
		channel = ChannelUpdates
	}
	android := map[string]any{
		"priority": "HIGH",
		"notification": map[string]any{
			"channel_id": channel,
			"tag":        m.Tag,
			"icon":       "ic_stat_ub",
			"color":      "#F6B445",
		},
	}
	if channel == ChannelOrders {
		android["ttl"] = "600s" // an order alert older than 10 minutes is no use
	}
	body, _ := json.Marshal(map[string]any{"message": map[string]any{
		"token":        token,
		"notification": map[string]string{"title": m.Title, "body": m.Body},
		"data":         map[string]string{"open": m.Open, "channel": channel},
		"android":      android,
	}})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		s.fcmURL, bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+access)
	req.Header.Set("Content-Type", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		return nil
	}
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1000))
	if res.StatusCode == http.StatusNotFound || bytes.Contains(b, []byte("UNREGISTERED")) ||
		(res.StatusCode == http.StatusBadRequest && bytes.Contains(b, []byte("registration token"))) {
		return ErrDeadToken
	}
	return fmt.Errorf("fcm: %s: %s", res.Status, b)
}

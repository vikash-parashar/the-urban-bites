// Package mail sends account emails (password reset links) through Brevo's HTTPS API.
//
// Render's free plan blocks outbound SMTP, so mail goes over HTTPS. Without BREVO_API_KEY the
// message is written to the log instead, which is enough for local testing.
package mail

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

type Sender struct {
	APIKey   string // BREVO_API_KEY
	From     string // MAIL_FROM, a sender verified in Brevo
	FromName string // MAIL_FROM_NAME
	Client   *http.Client
}

type Message struct {
	ToEmail, ToName, Subject, Text, HTML string
}

func (s *Sender) Configured() bool { return s != nil && s.APIKey != "" && s.From != "" }

func (s *Sender) Send(ctx context.Context, m Message) error {
	if !s.Configured() {
		slog.WarnContext(ctx, "email not configured; message logged instead", "to", m.ToEmail, "subject", m.Subject, "text", m.Text)
		return nil
	}
	body, err := json.Marshal(map[string]any{
		"sender":      map[string]string{"email": s.From, "name": s.FromName},
		"to":          []map[string]string{{"email": m.ToEmail, "name": m.ToName}},
		"subject":     m.Subject,
		"textContent": m.Text,
		"htmlContent": m.HTML,
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.brevo.com/v3/smtp/email", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("api-key", s.APIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	c := s.Client
	if c == nil {
		c = &http.Client{Timeout: 15 * time.Second}
	}
	resp, err := c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("brevo: %s: %s", resp.Status, msg)
	}
	return nil
}

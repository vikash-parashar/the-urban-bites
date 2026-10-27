// Command api serves the Urban Bites HTTP API, locally or on AWS Lambda behind API Gateway.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"

	"github.com/vikash-parashar/urban-bites/api/internal/auth"
	"github.com/vikash-parashar/urban-bites/api/internal/httpapi"
	"github.com/vikash-parashar/urban-bites/api/internal/mail"
	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx := context.Background()

	st, err := store.Open(ctx, mustEnv("DATABASE_URL"))
	if err != nil {
		slog.Error("open database", "err", err)
		os.Exit(1)
	}
	defer st.Close()
	if err := st.Migrate(ctx); err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}

	srv := &httpapi.Server{
		Store: st,
		Auth: &auth.Service{
			Store:  st,
			Secret: []byte(mustEnv("JWT_SECRET")),
			TTL:    30 * 24 * time.Hour, // fallback; see auth.TTLFor (admin 12 h, owner 60 days, riders 30 days, renewed on use)
		},
		Mail: &mail.Sender{
			APIKey:   os.Getenv("BREVO_API_KEY"),
			From:     os.Getenv("MAIL_FROM"),
			FromName: env("MAIL_FROM_NAME", "The Urban Bites"),
		},
		SiteURL:        env("SITE_URL", "https://the-urban-bites.onrender.com"),
		AllowedOrigins: strings.Split(env("ALLOWED_ORIGINS", "*"), ","),
	}
	if !srv.Mail.Configured() {
		slog.Warn("BREVO_API_KEY or MAIL_FROM not set: password reset emails are written to the log instead")
	}
	handler := srv.Routes()

	if os.Getenv("AWS_LAMBDA_RUNTIME_API") != "" {
		lambda.Start(httpadapter.NewV2(handler).ProxyWithContext)
		return
	}
	addr := ":" + env("PORT", "8080")
	slog.Info("listening", "addr", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		slog.Error("serve", "err", err)
		os.Exit(1)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("missing required env var", "key", key)
		os.Exit(1)
	}
	return v
}

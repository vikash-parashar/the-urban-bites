package push

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testSender(t *testing.T, fcm http.HandlerFunc) (*Sender, *int) {
	t.Helper()
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	pemKey := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	tokenCalls := 0
	tokenSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenCalls++
		_ = r.ParseForm()
		if r.Form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" || r.Form.Get("assertion") == "" {
			http.Error(w, "bad", 400)
			return
		}
		w.Write([]byte(`{"access_token":"acc-1","expires_in":3600}`))
	}))
	t.Cleanup(tokenSrv.Close)
	fcmSrv := httptest.NewServer(fcm)
	t.Cleanup(fcmSrv.Close)
	sa, _ := json.Marshal(map[string]string{"project_id": "ub-test", "client_email": "x@ub-test.iam.gserviceaccount.com",
		"private_key": string(pemKey), "token_uri": tokenSrv.URL})
	s, err := New(string(sa))
	if err != nil {
		t.Fatal(err)
	}
	s.fcmURL = fcmSrv.URL
	return s, &tokenCalls
}

func TestSend(t *testing.T) {
	var got map[string]any
	s, tokenCalls := testSender(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer acc-1" {
			http.Error(w, "auth", 401)
			return
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.Write([]byte(`{"name":"projects/ub-test/messages/1"}`))
	})
	m := Message{Title: "नया ऑर्डर #1001", Body: "Rahul जी", Channel: ChannelOrders, Open: "#staff", Tag: "order-1001"}
	for range 2 {
		if err := s.Send(context.Background(), "tok-123", m); err != nil {
			t.Fatal(err)
		}
	}
	if *tokenCalls != 1 {
		t.Fatalf("access token should be cached, fetched %d times", *tokenCalls)
	}
	msg := got["message"].(map[string]any)
	android := msg["android"].(map[string]any)
	if msg["token"] != "tok-123" || android["priority"] != "HIGH" ||
		android["notification"].(map[string]any)["channel_id"] != "orders" ||
		msg["data"].(map[string]any)["open"] != "#staff" {
		t.Fatalf("unexpected message: %v", got)
	}
}

func TestDeadToken(t *testing.T) {
	s, _ := testSender(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		w.Write([]byte(`{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}`))
	})
	if err := s.Send(context.Background(), "old", Message{Title: "x"}); !errors.Is(err, ErrDeadToken) {
		t.Fatalf("want ErrDeadToken, got %v", err)
	}
}

func TestNewOff(t *testing.T) {
	s, err := New("  ")
	if err != nil || s.Enabled() {
		t.Fatal("empty credentials should turn pushes off")
	}
	if _, err := New("not json"); err == nil || !strings.Contains(err.Error(), "FIREBASE") {
		t.Fatalf("bad credentials should say so, got %v", err)
	}
}

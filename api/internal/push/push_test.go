package push

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/vikash-parashar/urban-bites/api/internal/store"
)

func TestNotify(t *testing.T) {
	pub, priv, err := GenerateKeys()
	if err != nil {
		t.Fatal(err)
	}
	var got []*http.Request
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r)
		if strings.HasSuffix(r.URL.Path, "/gone") {
			w.WriteHeader(http.StatusGone)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	s := &Sender{PublicKey: pub, PrivateKey: priv, Subject: "mailto:test@example.com", Client: srv.Client()}
	subs := []store.PushSub{browser(t, srv.URL+"/ok"), browser(t, srv.URL+"/gone")}
	gone := s.Notify(context.Background(), subs, Message{Title: "New order", Tag: "order-1a2b-3c4d"})

	if len(gone) != 1 || !strings.HasSuffix(gone[0], "/gone") {
		t.Fatalf("gone = %v, want the /gone endpoint only", gone)
	}
	if len(got) != 2 {
		t.Fatalf("push service got %d requests, want 2", len(got))
	}
	r := got[0]
	if r.Header.Get("Urgency") != "high" || r.Header.Get("TTL") != "3600" || r.Header.Get("Topic") != "order-1a2b-3c4d" {
		t.Errorf("headers: Urgency=%q TTL=%q Topic=%q", r.Header.Get("Urgency"), r.Header.Get("TTL"), r.Header.Get("Topic"))
	}
	if !strings.HasPrefix(r.Header.Get("Authorization"), "vapid t=") || r.Header.Get("Content-Encoding") != "aes128gcm" {
		t.Errorf("not a VAPID aes128gcm push: %q %q", r.Header.Get("Authorization"), r.Header.Get("Content-Encoding"))
	}
}

func TestNotifyOff(t *testing.T) {
	if gone := (&Sender{}).Notify(context.Background(), []store.PushSub{{Endpoint: "https://x"}}, Message{}); gone != nil {
		t.Fatal("an unconfigured sender should send nothing")
	}
}

func TestTopic(t *testing.T) {
	if got := topic("order-0b5c2e1a-1111-2222-3333-444455556666"); len(got) != 32 {
		t.Errorf("topic too long: %q", got)
	}
	if got := topic("a b/c"); got != "abc" {
		t.Errorf("topic(%q) = %q", "a b/c", got)
	}
}

// browser makes the keys a real browser would hand over from PushManager.subscribe().
func browser(t *testing.T, endpoint string) store.PushSub {
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	secret := make([]byte, 16)
	rand.Read(secret)
	enc := base64.RawURLEncoding.EncodeToString
	return store.PushSub{Endpoint: endpoint, P256dh: enc(k.PublicKey().Bytes()), Auth: enc(secret)}
}

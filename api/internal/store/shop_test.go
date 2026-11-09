package store

import (
	"errors"
	"testing"
)

func ptr[T any](v T) *T { return &v }

func TestOwnerCannotTouchAds(t *testing.T) {
	if !(ShopUpdate{AcceptingOrders: ptr(false)}).OwnerMay() {
		t.Fatal("owner should be able to pause orders")
	}
	for name, u := range map[string]ShopUpdate{
		"ads":     {AcceptingOrders: ptr(true), AdsEnabled: ptr(true)},
		"sponsor": {AcceptingOrders: ptr(true), SponsorEnabled: ptr(true)},
		"name":    {MaxDeliveryKm: ptr(5.0), SponsorName: ptr("X")},
		"url":     {MaxDeliveryKm: ptr(5.0), SponsorURL: ptr("https://x.in")},
	} {
		if u.OwnerMay() {
			t.Errorf("%s: owner must not change ad settings", name)
		}
	}
}

func TestCleanSponsor(t *testing.T) {
	ok := []string{"", "https://example.in/offer?x=1", "https://wa.me/918398907216", "tel:+91 83989 07216"}
	for _, l := range ok {
		u := ShopUpdate{SponsorURL: ptr("  " + l + " "), SponsorName: ptr(" Sharma Motors ")}
		if err := cleanSponsor(&u); err != nil {
			t.Errorf("%q: %v", l, err)
		}
		if *u.SponsorName != "Sharma Motors" || *u.SponsorURL != l {
			t.Errorf("%q not trimmed: %q %q", l, *u.SponsorName, *u.SponsorURL)
		}
	}
	for _, l := range []string{"javascript:alert(1)", "http://plain.in", "https://a.in/\"><script>", "ftp://x"} {
		if err := cleanSponsor(&ShopUpdate{SponsorURL: ptr(l)}); !errors.Is(err, ErrInvalid) {
			t.Errorf("%q should be refused, got %v", l, err)
		}
	}
	long := make([]byte, 141)
	for i := range long {
		long[i] = 'a'
	}
	if err := cleanSponsor(&ShopUpdate{SponsorText: ptr(string(long))}); !errors.Is(err, ErrInvalid) {
		t.Error("141-character line should be refused")
	}
}

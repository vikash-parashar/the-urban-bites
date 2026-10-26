package httpapi

import (
	"testing"
	"time"
)

func TestPeriodRange(t *testing.T) {
	now := time.Date(2026, 10, 28, 15, 0, 0, 0, ist) // a Wednesday
	cases := []struct{ period, date, from, to, bucket string }{
		{"day", "", "2026-10-28", "2026-10-28", "hour"},
		{"week", "", "2026-10-26", "2026-10-28", "day"},           // Monday, stops at today
		{"week", "2026-10-18", "2026-10-12", "2026-10-18", "day"}, // a Sunday belongs to the week before
		{"month", "", "2026-10-01", "2026-10-28", "day"},
		{"month", "2026-02-10", "2026-02-01", "2026-02-28", "day"},
		{"year", "2025-06-01", "2025-01-01", "2025-12-31", "month"},
	}
	for _, c := range cases {
		from, to, b, err := periodRange(c.period, c.date, now)
		if err != nil {
			t.Fatalf("%s %s: %v", c.period, c.date, err)
		}
		if got := from.Format("2006-01-02") + " " + to.Format("2006-01-02") + " " + b; got != c.from+" "+c.to+" "+c.bucket {
			t.Errorf("%s %s = %s", c.period, c.date, got)
		}
	}
	if _, _, _, err := periodRange("week", "2026-11-03", now); err == nil {
		t.Error("future week should fail")
	}
	if _, _, _, err := periodRange("decade", "", now); err == nil {
		t.Error("unknown period should fail")
	}
}

func TestCheckStrong(t *testing.T) {
	for _, pw := range []string{"UrbanDemo@2026", "manjeet7216-x", "password-123x", "Gulab-Jamun-77"} {
		email := "manjeet7216@gmail.com"
		err := checkStrong(pw, email)
		if (pw == "Gulab-Jamun-77") != (err == nil) {
			t.Errorf("checkStrong(%q) = %v", pw, err)
		}
	}
}

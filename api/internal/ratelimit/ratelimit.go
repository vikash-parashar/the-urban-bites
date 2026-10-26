// Package ratelimit counts attempts per key in a sliding window, in memory.
//
// The API runs as one small instance, so memory is enough to slow down password guessing.
package ratelimit

import (
	"sync"
	"time"
)

type Limiter struct {
	Max    int
	Window time.Duration

	mu   sync.Mutex
	hits map[string][]time.Time
	seen int
}

// Allow records an attempt for key and reports whether it is within the limit.
func (l *Limiter) Allow(key string) bool {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.hits == nil {
		l.hits = map[string][]time.Time{}
	}
	if l.seen++; l.seen%500 == 0 {
		for k, v := range l.hits {
			if len(v) == 0 || now.Sub(v[len(v)-1]) > l.Window {
				delete(l.hits, k)
			}
		}
	}
	recent := l.hits[key][:0]
	for _, t := range l.hits[key] {
		if now.Sub(t) < l.Window {
			recent = append(recent, t)
		}
	}
	if len(recent) >= l.Max {
		l.hits[key] = recent
		return false
	}
	l.hits[key] = append(recent, now)
	return true
}

// Reset forgets a key, e.g. after a successful sign-in.
func (l *Limiter) Reset(key string) {
	l.mu.Lock()
	delete(l.hits, key)
	l.mu.Unlock()
}

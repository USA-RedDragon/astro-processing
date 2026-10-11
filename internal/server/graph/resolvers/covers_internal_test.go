package resolvers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func TestCachedCoversFailsOnceForConcurrentCards(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		time.Sleep(100 * time.Millisecond)
		http.Error(w, "down", http.StatusBadGateway)
	}))
	t.Cleanup(srv.Close)
	r := &Resolver{worker: workerclient.New(srv.URL)}
	var wg sync.WaitGroup
	for range 8 {
		wg.Go(func() {
			if _, err := r.cachedCovers(context.Background()); err == nil {
				t.Error("want an error from a failing worker")
			}
		})
	}
	wg.Wait()
	if n := calls.Load(); n != 1 {
		t.Errorf("worker called %d times for one page of cards, want 1", n)
	}
}

func TestCachedCoversOutlivesACancelledCard(t *testing.T) {
	t.Parallel()
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		time.Sleep(100 * time.Millisecond)
		_, _ = w.Write([]byte(`{"objects":{"M31":{"filter":"L","preview_url":"u"}},"mosaics":{}}`))
	}))
	t.Cleanup(srv.Close)
	r := &Resolver{worker: workerclient.New(srv.URL)}
	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		time.Sleep(20 * time.Millisecond)
		cancel()
	}()
	_, _ = r.cachedCovers(ctx)
	c, err := r.cachedCovers(context.Background())
	if err != nil || c.Objects["M31"].PreviewURL != "u" {
		t.Fatalf("covers %+v, %v", c, err)
	}
	if n := calls.Load(); n != 1 {
		t.Errorf("worker called %d times, want 1", n)
	}
}

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

func TestBestCoverPrefersAShownPictureOverAWaitingOne(t *testing.T) {
	t.Parallel()
	objects := map[string]workerclient.Cover{
		"A": {Waiting: true, EffectiveSeconds: 9000},
		"B": {Filter: "Ha", PreviewURL: "b", EffectiveSeconds: 600},
		"C": {Palette: "SHO", PreviewURL: "c", EffectiveSeconds: 300},
	}
	if got := bestCover(objects, []string{"A", "B"}); got == nil || got.PreviewURL != "b" {
		t.Errorf("got %+v, want the single-filter cover B", got)
	}
	if got := bestCover(objects, []string{"A", "B", "C"}); got == nil || got.PreviewURL != "c" {
		t.Errorf("got %+v, want the colour cover C", got)
	}
	if got := bestCover(objects, []string{"A"}); got == nil || !got.Waiting {
		t.Errorf("got %+v, want the waiting cover A", got)
	}
	if got := bestCover(objects, []string{"Z"}); got != nil {
		t.Errorf("got %+v, want nil", got)
	}
}

func TestCoversDecodesWaiting(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"objects":{"M31":{"waiting":true,"preview_url":"","palette":"","filter":""},"M33":{"filter":"Ha","preview_url":"u"}},"mosaics":{}}`))
	}))
	t.Cleanup(srv.Close)
	c, err := workerclient.New(srv.URL).Covers(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !c.Objects["M31"].Waiting || c.Objects["M33"].Waiting || c.Objects["M33"].Filter != "Ha" {
		t.Errorf("covers %+v", c.Objects)
	}
}

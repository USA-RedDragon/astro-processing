package resolvers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func TestMastersCarryLocalNorm(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/stacks" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[
			{"filter":"Red","subs":12,"updated_at":"2026-10-10T08:45:06Z","local_norm":true,"local_norm_subs":9,"local_norm_uneven":0.23,"local_norm_threshold":0.1},
			{"filter":"Blue","subs":8,"updated_at":"2026-10-10T08:45:06Z","local_norm":null,"local_norm_subs":null,"local_norm_uneven":null,"local_norm_threshold":0.1},
			{"filter":"Green","subs":8,"updated_at":"2026-10-10T08:45:06Z"}]`))
	}))
	t.Cleanup(srv.Close)
	r := &Resolver{worker: workerclient.New(srv.URL)}
	masters, err := r.masters(context.Background(), "M31")
	if err != nil {
		t.Fatal(err)
	}
	red := masters[0]
	if red.LocalNorm == nil || !*red.LocalNorm || red.LocalNormSubs == nil || *red.LocalNormSubs != 9 ||
		red.LocalNormUneven == nil || *red.LocalNormUneven != 0.23 || red.LocalNormThreshold == nil || *red.LocalNormThreshold != 0.1 {
		t.Errorf("red = %+v", red)
	}
	for _, m := range masters[1:] {
		if m.LocalNorm != nil || m.LocalNormSubs != nil || m.LocalNormUneven != nil {
			t.Errorf("%s: unknown local normalization should stay null: %+v", m.Filter, m)
		}
	}
	if masters[2].LocalNormThreshold != nil {
		t.Errorf("an older stacker's master has no threshold: %v", *masters[2].LocalNormThreshold)
	}
}

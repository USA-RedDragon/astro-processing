package resolvers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func TestMosaicsPassTheXISFLinkThrough(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/mosaics" || r.URL.Query().Get("project") != "Heart and Soul" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[` +
			`{"filter":"Ha","panels":2,"panels_total":2,"updated_at":"2026-10-10T00:00:00Z","master_url":"f","preview_url":"p","linear_url":"l","xisf_url":"x"},` +
			`{"filter":"OIII","panels":1,"panels_total":2,"updated_at":"2026-10-10T00:00:00Z","master_url":"f2","preview_url":"p2","linear_url":"l2"}]`))
	}))
	t.Cleanup(srv.Close)
	r := &projectResolver{&Resolver{worker: workerclient.New(srv.URL)}}
	got, err := r.Mosaics(context.Background(), &model.Project{Name: "Heart and Soul"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d mosaics, want 2", len(got))
	}
	if got[0].XisfURL == nil || *got[0].XisfURL != "x" || got[0].MasterURL != "f" {
		t.Errorf("Ha mosaic %+v, want xisf_url x and master_url f", got[0])
	}
	if got[1].XisfURL != nil {
		t.Errorf("OIII mosaic xisf_url %q, want null when the stacker has none", *got[1].XisfURL)
	}
}

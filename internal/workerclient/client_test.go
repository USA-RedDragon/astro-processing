package workerclient_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func TestNewEmptyURLDisables(t *testing.T) {
	t.Parallel()
	if workerclient.New("") != nil {
		t.Fatal("empty URL should give a nil client")
	}
}

func TestCoverageAndGaps(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v1/coverage":
			if got := r.URL.Query().Get("object"); got != "Bode's Galaxy" {
				t.Errorf("object = %q", got)
			}
			_, _ = w.Write([]byte(`[{"night":"2025-12-10","object":"Bode's Galaxy","filter":"Red","exposure":300,"gain":0,"offset":50,
				"set_temp":-23,"lights":20,"flat":{"quality":"fallback","night":"2025-05-13","frames":30,"age_days":211,"rotation_mismatch":true},
				"dark":{"quality":"missing","age_days":0},"bias":{"quality":"fallback","night":"2025-02-05","frames":30,"age_days":308}}]`))
		case "/api/v1/coverage/dark-gaps":
			_, _ = w.Write([]byte(`[{"gain":0,"offset":50,"set_temp":-25,"lights":2566,"nights":48,"latest_night":"2026-02-25"}]`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := workerclient.New(srv.URL + "/")
	rows, err := c.Coverage(context.Background(), "Bode's Galaxy")
	if err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Flat.AgeDays != 211 || !rows[0].Flat.RotationMismatch || rows[0].Dark.Quality != "missing" {
		t.Errorf("rows = %+v", rows)
	}
	gaps, err := c.DarkGaps(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(gaps) != 1 || gaps[0].SetTemp != -25 || gaps[0].Lights != 2566 {
		t.Errorf("gaps = %+v", gaps)
	}
}

func TestErrorStatus(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer srv.Close()
	if _, err := workerclient.New(srv.URL).DarkGaps(context.Background()); err == nil {
		t.Fatal("expected an error")
	}
}

func TestSubs(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/subs" || r.URL.Query().Get("object") != "Orion Nebula" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[{"file":"a.fits","filter":"L","exposure":300,"status":"low_score","score":0.04,"weight":0,
			"processed_at":"2026-10-07T21:00:00Z","photometry":"measured"},{"file":"b.fits","filter":"L","score":null,"weight":null,"photometry":"pending",
			"scoring":{"min_score":0.3,"cut":0.24,"pedestal_adu":503,"pedestal_source":"bias","sky_adu":80}}]`))
	}))
	defer srv.Close()

	subs, err := workerclient.New(srv.URL).Subs(context.Background(), "Orion Nebula")
	if err != nil {
		t.Fatal(err)
	}
	if len(subs) != 2 || subs[0].Status != "low_score" || subs[0].Score == nil || *subs[0].Score != 0.04 || subs[0].Photometry != "measured" ||
		subs[0].ProcessedAt == nil || subs[1].Status != "" || subs[1].ProcessedAt != nil ||
		subs[1].Score != nil || subs[1].Scoring == nil || *subs[1].Scoring.Cut != 0.24 || subs[1].Scoring.PedestalSource != "bias" {
		t.Errorf("got %+v", subs)
	}
}

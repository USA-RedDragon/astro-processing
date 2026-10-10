package resolvers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func TestOtherTargetsUseRecordedLights(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/objects" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`[
			{"name":"Comet","lights":5,"recorded":0,"scheduled":false},
			{"name":"Old Target","lights":3,"recorded":2,"scheduled":false},
			{"name":"Recorded","lights":4,"recorded":4,"scheduled":false},
			{"name":"Pleiades","lights":443,"recorded":10,"scheduled":true}
		]`))
	}))
	t.Cleanup(srv.Close)
	q := &queryResolver{&Resolver{worker: workerclient.New(srv.URL)}}
	got, err := q.OtherTargets(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].Name != "Comet" || got[1].Name != "Old Target" || got[1].Recorded != 2 || got[1].Lights != 3 {
		t.Fatalf("other targets %+v", got)
	}
	for _, name := range []string{"Pleiades", "Recorded"} {
		o, err := q.OtherTarget(context.Background(), name)
		if err != nil || o != nil {
			t.Errorf("%s: %+v %v", name, o, err)
		}
	}
	if o, err := q.OtherTarget(context.Background(), "Old Target"); err != nil || o == nil || o.Recorded != 2 {
		t.Errorf("old target %+v %v", o, err)
	}
}

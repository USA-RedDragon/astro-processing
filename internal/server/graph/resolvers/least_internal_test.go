package resolvers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func ptr(v float64) *float64 { return &v }

func TestProgressOrderFollowsLeastFilter(t *testing.T) {
	t.Parallel()
	snap := map[string]any{"projects": []workerclient.ProjectLeast{
		{ID: 1, Least: workerclient.Least{Filters: 3, Progress: ptr(0.4)}},
		{ID: 2, Least: workerclient.Least{Filters: 3, Enough: true, Progress: ptr(1)}},
		{ID: 3, Least: workerclient.Least{Filters: 3}},
		{ID: 4, Least: workerclient.Least{}},
		{ID: 5, Least: workerclient.Least{Filters: 2, Progress: ptr(0.05)}},
		{ID: 7, Least: workerclient.Least{Filters: 2}},
	}}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		if req.URL.Path != "/api/v1/planning" {
			http.NotFound(w, req)
			return
		}
		_ = json.NewEncoder(w).Encode(snap)
	}))
	defer srv.Close()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&targetscheduler.Project{}); err != nil {
		t.Fatal(err)
	}
	for id, name := range map[int]string{1: "Andromeda", 2: "Bodes", 3: "Crab", 4: "Dolphin", 5: "Eagle", 6: "Fresh", 7: "Garlic"} {
		if err := db.Create(&targetscheduler.Project{ID: id, Name: name, ProfileID: "p"}).Error; err != nil {
			t.Fatal(err)
		}
	}
	r := &queryResolver{&Resolver{db: db, worker: workerclient.New(srv.URL)}}
	for _, tc := range []struct {
		dir  model.OrderDirection
		want []int
	}{
		{model.OrderDirectionDesc, []int{2, 1, 5, 3, 7, 4, 6}},
		{model.OrderDirectionAsc, []int{4, 3, 7, 5, 1, 2, 6}},
	} {
		got, err := r.Projects(context.Background(), &model.ProjectOrderBy{Field: model.ProjectOrderFieldProgress, Direction: tc.dir})
		if err != nil {
			t.Fatal(err)
		}
		ids := make([]int, 0, len(got))
		for _, p := range got {
			ids = append(ids, p.ID)
		}
		if len(ids) != len(tc.want) {
			t.Fatalf("%s: got %v", tc.dir, ids)
		}
		for i := range ids {
			if ids[i] != tc.want[i] {
				t.Fatalf("%s: got %v, want %v", tc.dir, ids, tc.want)
			}
		}
	}
}

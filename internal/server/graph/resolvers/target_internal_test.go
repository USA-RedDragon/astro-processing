package resolvers

import (
	"context"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestTargetWithoutProjectHasNoProject(t *testing.T) {
	t.Parallel()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&targetscheduler.Project{}); err != nil {
		t.Fatal(err)
	}
	r := &targetResolver{&Resolver{db: db}}
	for _, target := range []*model.Target{
		{ID: 1, Name: "Orphan"},
		{ID: 2, Name: "Dangling", Project: &model.Project{ID: 99}},
	} {
		p, err := r.Project(context.Background(), target)
		if err != nil || p != nil {
			t.Errorf("%s: project %+v, %v", target.Name, p, err)
		}
	}
}

func TestMissingTargetOrProjectIsNull(t *testing.T) {
	t.Parallel()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&targetscheduler.Project{}, &targetscheduler.Target{}); err != nil {
		t.Fatal(err)
	}
	r := &queryResolver{&Resolver{db: db}}
	if tg, err := r.Target(context.Background(), 999999); err != nil || tg != nil {
		t.Errorf("target: %+v, %v", tg, err)
	}
	if p, err := r.Project(context.Background(), 999999); err != nil || p != nil {
		t.Errorf("project: %+v, %v", p, err)
	}
}

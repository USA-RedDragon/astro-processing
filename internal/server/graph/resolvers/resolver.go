package resolvers

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/types"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:generate go tool gqlgen generate

type Resolver struct {
	config  *config.Config
	db      *gorm.DB
	version string
	commit  string
	refs    *referenceCache
	worker  *workerclient.Client
	covers  coverCache
}

// coverCache holds the worker's cover previews briefly, so a page of
// project cards costs one worker call.
type coverCache struct {
	mu     sync.Mutex
	at     time.Time
	covers *workerclient.Covers
}

func (r *Resolver) cachedCovers(ctx context.Context) (*workerclient.Covers, error) {
	r.covers.mu.Lock()
	defer r.covers.mu.Unlock()
	if r.covers.covers != nil && time.Since(r.covers.at) < 30*time.Second {
		return r.covers.covers, nil
	}
	c, err := r.worker.Covers(ctx)
	if err != nil {
		return nil, err
	}
	r.covers.covers, r.covers.at = c, time.Now()
	return c, nil
}

func NewResolver(cfg *config.Config, version string, commit string) (*Resolver, error) {
	var dialect gorm.Dialector
	switch cfg.Storage.Type {
	case types.StorageTypeSQLite:
		dialect = sqlite.Open(cfg.Storage.DSN)
	case types.StorageTypePostgres:
		dialect = postgres.Open(cfg.Storage.DSN)
	case types.StorageTypeMySQL:
		dialect = mysql.Open(cfg.Storage.DSN)
	default:
		return nil, config.ErrInvalidStorageType
	}

	db, err := gorm.Open(dialect, &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get sql.DB from gorm.DB: %w", err)
	}

	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(25)
	sqlDB.SetConnMaxIdleTime(15 * time.Minute)
	sqlDB.SetConnMaxLifetime(1 * time.Hour)

	return &Resolver{config: cfg, db: db, version: version, commit: commit, refs: &referenceCache{}, worker: workerclient.New(cfg.Worker.URL)}, nil
}

func graphCrop(c *workerclient.Crop) *model.Crop {
	if c == nil {
		return nil
	}
	return &model.Crop{X: c.X, Y: c.Y, W: c.W, H: c.H}
}

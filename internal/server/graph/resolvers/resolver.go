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
	worker  *workerclient.Client
	covers  coverCache
}

// coverCache holds the worker's cover previews for a few seconds, so a page
// of project cards costs one worker call and live updates see new covers.
type coverCache struct {
	mu     sync.Mutex
	at     time.Time
	covers *workerclient.Covers
}

func (r *Resolver) cachedCovers(ctx context.Context) (*workerclient.Covers, error) {
	r.covers.mu.Lock()
	defer r.covers.mu.Unlock()
	if r.covers.covers != nil && time.Since(r.covers.at) < 5*time.Second {
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

	return &Resolver{config: cfg, db: db, version: version, commit: commit, worker: workerclient.New(cfg.Worker.URL)}, nil
}

// DB is the scheduler database.
func (r *Resolver) DB() *gorm.DB { return r.db }

func graphCrop(c *workerclient.Crop) *model.Crop {
	if c == nil {
		return nil
	}
	return &model.Crop{X: c.X, Y: c.Y, W: c.W, H: c.H}
}

// optional is nil for an empty string, for nullable GraphQL fields.
func optional(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// masters is a target's masters from the worker, by name.
func (r *Resolver) masters(ctx context.Context, object string) ([]*model.FilterMaster, error) {
	if r.worker == nil {
		return []*model.FilterMaster{}, nil
	}
	masters, err := r.worker.Masters(ctx, object)
	if err != nil {
		return nil, fmt.Errorf("failed to get masters: %w", err)
	}
	out := make([]*model.FilterMaster, 0, len(masters))
	for _, m := range masters {
		out = append(out, &model.FilterMaster{
			Filter: m.Filter, Subs: m.Subs,
			ExposureHours: m.ExposureSeconds / 3600, EffectiveHours: m.EffectiveSeconds / 3600,
			Width: m.Width, Height: m.Height, UpdatedAt: m.UpdatedAt.UTC().Format(time.RFC3339),
			MasterURL: m.MasterURL, PreviewURL: m.PreviewURL, LinearURL: m.LinearURL,
			Crop:      graphCrop(m.Crop),
			XisfURL:   optional(m.XISFURL),
			FittedURL: optional(m.FittedURL), FitReference: optional(m.FitReference),
			CometPreviewURL: optional(m.CometPreviewURL), CometURL: optional(m.CometURL), CometXisfURL: optional(m.CometXISFURL),
			MinScore: m.MinScore, LowestScore: m.LowestScore,
		})
	}
	return out, nil
}

func isOther(o workerclient.Object) bool {
	return !o.Scheduled && o.Recorded < o.Lights
}

func graphObject(o workerclient.Object) *model.OtherTarget {
	return &model.OtherTarget{Name: o.Name, Lights: o.Lights, Recorded: o.Recorded, Stacked: o.Stacked, Nights: o.Nights,
		FirstNight: o.FirstNight, LastNight: o.LastNight}
}

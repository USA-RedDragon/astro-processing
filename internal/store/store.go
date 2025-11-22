package store

import (
	"context"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/store/gorm"
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/USA-RedDragon/astro-processing/internal/types"
)

type Store interface {
	WithContext(ctx context.Context) Store
	ListTargets() ([]targetscheduler.Target, error)
}

type gormStore struct {
	*gorm.Gorm
}

func (g *gormStore) WithContext(ctx context.Context) Store {
	return &gormStore{
		Gorm: g.Gorm.WithContext(ctx),
	}
}

func NewStore(cfg *config.Config) (Store, error) {
	switch cfg.Storage.Type {
	case types.StorageTypeSQLite, types.StorageTypeMySQL, types.StorageTypePostgres:
		g, err := gorm.NewGormStore(cfg)
		if err != nil {
			return nil, err
		}
		return &gormStore{Gorm: g}, nil
	default:
		return nil, config.ErrInvalidStorageType
	}
}

package store

import (
	"context"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	v1 "github.com/USA-RedDragon/astro-processing/internal/server/apimodels/v1"
	"github.com/USA-RedDragon/astro-processing/internal/store/gorm"
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/USA-RedDragon/astro-processing/internal/types"
)

type Store interface {
	WithContext(ctx context.Context) Store
	ListTargets() ([]targetscheduler.Target, error)
	GetTargetByID(id int) (*targetscheduler.Target, error)
	GetTargetImageStats(targetID int) (v1.TargetImageStatsResponse, error)
	ListProjects() ([]targetscheduler.Project, error)
	GetProjectByID(id int) (*targetscheduler.Project, error)
	ListTargetsByProjectID(projectID int) ([]targetscheduler.Target, error)
	GetProjectImageStats(projectID int) (v1.ProjectStatsResponse, error)
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

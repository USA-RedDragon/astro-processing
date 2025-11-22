package store

import (
	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/store/gorm"
	"github.com/USA-RedDragon/astro-processing/internal/types"
)

type Store interface {
}

func NewStore(cfg *config.Config) (Store, error) {
	switch cfg.Storage.Type {
	case types.StorageTypeSQLite, types.StorageTypeMySQL, types.StorageTypePostgres:
		return gorm.NewGormStore(cfg)
	default:
		return nil, config.ErrInvalidStorageType
	}
}

package gorm

import (
	"fmt"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/types"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Gorm struct {
	db *gorm.DB
}

func NewGormStore(cfg *config.Config) (*Gorm, error) {
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

	// err = db.AutoMigrate(&models.User{}, &models.Progress{})
	// if err != nil {
	// 	return nil, fmt.Errorf("failed to migrate database: %w", err)
	// }

	return &Gorm{
		db: db,
	}, nil
}

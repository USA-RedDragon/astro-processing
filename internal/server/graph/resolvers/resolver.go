package resolvers

import (
	"fmt"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/types"
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

	return &Resolver{config: cfg, db: db, version: version, commit: commit}, nil
}

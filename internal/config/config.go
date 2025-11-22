package config

import (
	"errors"

	"github.com/USA-RedDragon/astro-processing/internal/store/utils"
	"github.com/USA-RedDragon/astro-processing/internal/types"
)

type LogLevel string

const (
	LogLevelDebug LogLevel = "debug"
	LogLevelInfo  LogLevel = "info"
	LogLevelWarn  LogLevel = "warn"
	LogLevelError LogLevel = "error"
)

type Config struct {
	LogLevel LogLevel `name:"log-level" description:"Logging level for the application. One of debug, info, warn, or error" default:"info"`
	HTTP     HTTP     `name:"http" description:"HTTP server configuration"`
	Metrics  Metrics  `name:"metrics" description:"Metrics server configuration"`
	PProf    PProf    `name:"pprof" description:"PProf server configuration"`
	Storage  Storage  `name:"storage" description:"Storage configuration"`
}

type HTTP struct {
	Bind           string   `name:"bind" description:"Address to listen on" default:"[::]"`
	Port           int      `name:"port" description:"Port to listen on" default:"8080"`
	TrustedProxies []string `name:"trusted-proxies" description:"Trusted proxies for the HTTP server"`
	CORS           CORS     `name:"cors" description:"CORS configuration"`
}

type CORS struct {
	Enabled          bool     `name:"enabled" description:"Enable CORS"`
	AllowedOrigins   []string `name:"allowed-origins" description:"List of allowed origins for CORS" default:"*"`
	AllowedMethods   []string `name:"allowed-methods" description:"List of allowed HTTP methods for CORS" default:"GET,POST,PUT,DELETE,OPTIONS"`
	AllowedHeaders   []string `name:"allowed-headers" description:"List of allowed HTTP headers for CORS" default:"Origin,Content-Type,Accept,Authorization"`
	AllowCredentials bool     `name:"allow-credentials" description:"Allow credentials for CORS"`
}

type Metrics struct {
	Enabled bool   `name:"enabled" description:"Enable metrics server"`
	Bind    string `name:"bind" description:"Address to listen on" default:"127.0.0.1"`
	Port    int    `name:"port" description:"Port to listen on" default:"9000"`
}

type PProf struct {
	Enabled bool   `name:"enabled" description:"Enable pprof server"`
	Bind    string `name:"bind" description:"Address to listen on" default:"127.0.0.1"`
	Port    int    `name:"port" description:"Port to listen on" default:"9999"`
}

type Storage struct {
	Type types.StorageType `name:"type" description:"Storage type. One of mysql, postgres, sqlite" default:"sqlite"`
	DSN  string            `name:"dsn" description:"Data source name for the storage" default:":memory:?_pragma=foreign_keys(1)"`
}

var (
	ErrInvalidLogLevel    = errors.New("invalid log level provided")
	ErrInvalidStorageType = errors.New("invalid storage type provided")
	ErrEmptyStorageDSN    = errors.New("storage DSN cannot be empty")
	ErrInvalidStorageDSN  = errors.New("invalid storage DSN provided")
)

func (c Config) Validate() error {
	if c.LogLevel != LogLevelDebug &&
		c.LogLevel != LogLevelInfo &&
		c.LogLevel != LogLevelWarn &&
		c.LogLevel != LogLevelError {
		return ErrInvalidLogLevel
	}

	if c.Storage.Type != types.StorageTypeMySQL &&
		c.Storage.Type != types.StorageTypePostgres &&
		c.Storage.Type != types.StorageTypeSQLite {
		return ErrInvalidStorageType
	}

	if c.Storage.DSN == "" {
		return ErrEmptyStorageDSN
	}

	if err := utils.TestDSN(c.Storage.Type, c.Storage.DSN); err != nil {
		return ErrInvalidStorageDSN
	}

	return nil
}

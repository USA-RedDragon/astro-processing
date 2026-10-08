# astro-processing

[![coverage](https://raw.githubusercontent.com/USA-RedDragon/astro-processing/main/.github/badges/coverage.svg)](https://github.com/USA-RedDragon/astro-processing/actions)

## Configuration

Settings come from `config.yaml` (see [config.example.yaml](config.example.yaml)), environment variables, and command-line flags.

<!-- configulator:begin -->

| Key                           | Type           | Default                                    | Environment                   | Flag                            | Description                                                                                                                       |
|-------------------------------|----------------|--------------------------------------------|-------------------------------|---------------------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| `log-level`                   | string         | `info`                                     | `LOG_LEVEL`                   | `--log-level`                   | Logging level for the application. One of debug, info, warn, or error                                                             |
| `http.bind`                   | string         | `[::]`                                     | `HTTP_BIND`                   | `--http.bind`                   | Address to listen on                                                                                                              |
| `http.port`                   | integer        | `8080`                                     | `HTTP_PORT`                   | `--http.port`                   | Port to listen on                                                                                                                 |
| `http.trusted-proxies`        | list of string |                                            | `HTTP_TRUSTED_PROXIES`        | `--http.trusted-proxies`        | Trusted proxies for the HTTP server                                                                                               |
| `http.cors.enabled`           | boolean        |                                            | `HTTP_CORS_ENABLED`           | `--http.cors.enabled`           | Enable CORS                                                                                                                       |
| `http.cors.allowed-origins`   | list of string | `*`                                        | `HTTP_CORS_ALLOWED_ORIGINS`   | `--http.cors.allowed-origins`   | List of allowed origins for CORS                                                                                                  |
| `http.cors.allowed-methods`   | list of string | `GET,POST,PUT,DELETE,OPTIONS`              | `HTTP_CORS_ALLOWED_METHODS`   | `--http.cors.allowed-methods`   | List of allowed HTTP methods for CORS                                                                                             |
| `http.cors.allowed-headers`   | list of string | `Origin,Content-Type,Accept,Authorization` | `HTTP_CORS_ALLOWED_HEADERS`   | `--http.cors.allowed-headers`   | List of allowed HTTP headers for CORS                                                                                             |
| `http.cors.allow-credentials` | boolean        |                                            | `HTTP_CORS_ALLOW_CREDENTIALS` | `--http.cors.allow-credentials` | Allow credentials for CORS                                                                                                        |
| `metrics.enabled`             | boolean        |                                            | `METRICS_ENABLED`             | `--metrics.enabled`             | Enable metrics server                                                                                                             |
| `metrics.bind`                | string         | `127.0.0.1`                                | `METRICS_BIND`                | `--metrics.bind`                | Address to listen on                                                                                                              |
| `metrics.port`                | integer        | `9000`                                     | `METRICS_PORT`                | `--metrics.port`                | Port to listen on                                                                                                                 |
| `pprof.enabled`               | boolean        |                                            | `PPROF_ENABLED`               | `--pprof.enabled`               | Enable pprof server                                                                                                               |
| `pprof.bind`                  | string         | `127.0.0.1`                                | `PPROF_BIND`                  | `--pprof.bind`                  | Address to listen on                                                                                                              |
| `pprof.port`                  | integer        | `9999`                                     | `PPROF_PORT`                  | `--pprof.port`                  | Port to listen on                                                                                                                 |
| `storage.type`                | string         | `sqlite`                                   | `STORAGE_TYPE`                | `--storage.type`                | Storage type. One of mysql, postgres, sqlite                                                                                      |
| `storage.dsn`                 | string         | `:memory:?_pragma=foreign_keys(1)`         | `STORAGE_DSN`                 | `--storage.dsn`                 | Data source name for the storage                                                                                                  |
| `quality.pedestal`            | number         | `506`                                      | `QUALITY_PEDESTAL`            | `--quality.pedestal`            | Camera pedestal in ADU at offset 50, adjusted for each sub's offset and subtracted from its ADU median to show the sky background |
| `worker.url`                  | string         |                                            | `WORKER_URL`                  | `--worker.url`                  | Base URL of pixinsight-worker, for calibration coverage. Empty disables it                                                        |

<!-- configulator:end -->

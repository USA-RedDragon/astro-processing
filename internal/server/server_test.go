package server_test

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/server"
	"github.com/USA-RedDragon/astro-processing/internal/types"
)

func TestStopEndsEventStreams(t *testing.T) {
	t.Parallel()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := ln.Addr().(*net.TCPAddr).Port
	_ = ln.Close()
	cfg := &config.Config{
		LogLevel: config.LogLevelInfo,
		HTTP:     config.HTTP{Bind: "127.0.0.1", Port: port},
		Storage:  config.Storage{Type: types.StorageTypeSQLite, DSN: ":memory:"},
	}
	srv, err := server.NewServer(cfg, "test", "test")
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/events", port), nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	start := time.Now()
	if err := srv.Stop(); err != nil {
		t.Fatalf("stop with a browser connected: %v", err)
	}
	if d := time.Since(start); d > 2*time.Second {
		t.Errorf("stop took %v", d)
	}
}

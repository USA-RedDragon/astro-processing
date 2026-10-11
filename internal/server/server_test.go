package server_test

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
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

func TestSlowWorkerAnswerReachesTheBrowser(t *testing.T) {
	t.Parallel()
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		time.Sleep(6 * time.Second)
		_, _ = w.Write([]byte(`{"ladder":[-15],"gaps":[]}`))
	}))
	t.Cleanup(worker.Close)
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
		Worker:   config.Worker{URL: worker.URL},
	}
	srv, err := server.NewServer(cfg, "test", "test")
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = srv.Stop() })
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/query", port),
		strings.NewReader(`{"query":"{ darkLibrary { ladder } }"}`))
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil || !strings.Contains(string(body), `"ladder":[-15]`) {
		t.Fatalf("body %q, %v", body, err)
	}
}

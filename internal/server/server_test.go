package server_test

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/server"
	"github.com/USA-RedDragon/astro-processing/internal/types"
)

func start(t *testing.T, workerURL string) (*server.Server, string) {
	t.Helper()
	var lc net.ListenConfig
	ln, err := lc.Listen(context.Background(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr, ok := ln.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener address %v", ln.Addr())
	}
	_ = ln.Close()
	cfg := &config.Config{
		LogLevel: config.LogLevelInfo,
		HTTP:     config.HTTP{Bind: addr.IP.String(), Port: addr.Port},
		Storage:  config.Storage{Type: types.StorageTypeSQLite, DSN: ":memory:"},
		Worker:   config.Worker{URL: workerURL},
	}
	srv, err := server.NewServer(cfg, "test", "test")
	if err != nil {
		t.Fatal(err)
	}
	if err := srv.Start(); err != nil {
		t.Fatal(err)
	}
	return srv, fmt.Sprintf("http://%s", addr)
}

func query(t *testing.T, base, q string) string {
	t.Helper()
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, base+"/query",
		strings.NewReader(fmt.Sprintf(`{"query":%q}`, q)))
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func TestStopEndsEventStreams(t *testing.T) {
	t.Parallel()
	srv, base := start(t, "")
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, base+"/events", nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	begin := time.Now()
	if err := srv.Stop(); err != nil {
		t.Fatalf("stop with a browser connected: %v", err)
	}
	if d := time.Since(begin); d > 2*time.Second {
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
	srv, base := start(t, worker.URL)
	t.Cleanup(func() { _ = srv.Stop() })
	if body := query(t, base, "{ darkLibrary { ladder } }"); !strings.Contains(body, `"ladder":[-15]`) {
		t.Fatalf("body %q", body)
	}
}

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *lockedBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *lockedBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

//nolint:paralleltest
func TestQueryErrorsAreLogged(t *testing.T) {
	var logs lockedBuffer
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(prev) })
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	t.Cleanup(worker.Close)
	srv, base := start(t, worker.URL)
	t.Cleanup(func() { _ = srv.Stop() })
	query(t, base, "{ darkLibrary { ladder } }")
	if !strings.Contains(logs.String(), "failed to get dark library gaps") || !strings.Contains(logs.String(), "darkLibrary") {
		t.Fatalf("query error not logged: %s", logs.String())
	}
}

package events

import (
	"context"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestShutdownEndsOpenStreams(t *testing.T) {
	t.Parallel()
	relay := NewRelay()
	var lc net.ListenConfig
	ln, err := lc.Listen(context.Background(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	srv := &http.Server{Handler: relay, ReadHeaderTimeout: time.Second}
	srv.RegisterOnShutdown(relay.Close)
	go func() { _ = srv.Serve(ln) }()
	req, _ := http.NewRequestWithContext(context.Background(), http.MethodGet, "http://"+ln.Addr().String(), nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown with a browser connected: %v", err)
	}
}

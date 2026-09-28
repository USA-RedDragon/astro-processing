package events

import (
	"bufio"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestRelayPassesWorkerEventsThrough(t *testing.T) {
	// A fake worker: one master event, a status, then it holds the stream.
	worker := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "retry: 3000\n\n")
		fmt.Fprint(w, "id: 41\ndata: {\"type\":\"master\",\"object\":\"M31\"}\n\n")
		fmt.Fprint(w, ": keepalive\n\n")
		fmt.Fprint(w, "data: {\"type\":\"status\",\"workers\":[]}\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer worker.Close()

	relay := NewRelay()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go relay.Run(ctx, worker.URL)
	deadline := time.Now().Add(2 * time.Second)
	for {
		relay.mu.Lock()
		ready := relay.status != nil && relay.lastID == 41
		relay.mu.Unlock()
		if ready {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("relay never received the worker's messages")
		}
		time.Sleep(10 * time.Millisecond)
	}

	browser := httptest.NewServer(relay)
	defer browser.Close()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, browser.URL, nil)
	req.Header.Set("Last-Event-ID", "40")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	var got []string
	s := bufio.NewScanner(res.Body)
	for len(got) < 3 && s.Scan() {
		if l := s.Text(); strings.HasPrefix(l, "id: ") || strings.HasPrefix(l, "data: ") {
			got = append(got, l)
		}
	}
	want := []string{`data: {"type":"status","workers":[]}`, "id: 41", `data: {"type":"master","object":"M31"}`}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Fatalf("got %q, want %q", got, want)
	}
}

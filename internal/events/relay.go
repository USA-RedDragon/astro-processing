// Package events relays the worker's server-sent events (rendered
// previews, updated masters and its status) to browsers.
package events

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/metrics"
)

// keep is how many recent events a reconnecting browser can catch up on.
const keep = 512

type message struct {
	id  uint64
	raw []byte
}

// Relay holds one connection to the worker's stream and fans its messages
// out to browsers unchanged, so event IDs are the worker's.
type Relay struct {
	mu     sync.Mutex
	recent []message
	status []byte // latest status snapshot, sent to new browsers first
	subs   map[chan []byte]struct{}
	lastID uint64
}

func NewRelay() *Relay {
	return &Relay{subs: map[chan []byte]struct{}{}}
}

// Run follows the worker's stream at url until ctx is cancelled,
// reconnecting after a drop from the last event it saw.
func (r *Relay) Run(ctx context.Context, url string) {
	for {
		err := r.follow(ctx, url)
		if ctx.Err() != nil {
			return
		}
		slog.Warn("Worker event stream ended; reconnecting", "error", err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func (r *Relay) follow(ctx context.Context, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "text/event-stream")
	r.mu.Lock()
	if r.lastID > 0 {
		req.Header.Set("Last-Event-ID", strconv.FormatUint(r.lastID, 10))
	}
	r.mu.Unlock()
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("worker returned %s", res.Status)
	}
	metrics.WorkerStreamConnected.Set(1)
	defer metrics.WorkerStreamConnected.Set(0)
	return r.read(res.Body)
}

// read parses SSE messages: an optional id line and data lines, ended by a
// blank line. Comments and retry hints are dropped.
func (r *Relay) read(body io.Reader) error {
	s := bufio.NewScanner(body)
	s.Buffer(make([]byte, 64*1024), 1024*1024)
	var id uint64
	var data []string
	for s.Scan() {
		line := s.Text()
		switch {
		case line == "":
			if len(data) > 0 {
				metrics.WorkerEvents.Inc()
				r.dispatch(id, strings.Join(data, "\n"))
			}
			id, data = 0, nil
		case strings.HasPrefix(line, "id: "):
			id, _ = strconv.ParseUint(strings.TrimPrefix(line, "id: "), 10, 64)
		case strings.HasPrefix(line, "data: "):
			data = append(data, strings.TrimPrefix(line, "data: "))
		}
	}
	if err := s.Err(); err != nil {
		return err
	}
	return fmt.Errorf("stream closed")
}

func (r *Relay) dispatch(id uint64, data string) {
	var raw bytes.Buffer
	if id > 0 {
		fmt.Fprintf(&raw, "id: %d\n", id)
	}
	fmt.Fprintf(&raw, "data: %s\n\n", data)
	msg := raw.Bytes()
	r.mu.Lock()
	defer r.mu.Unlock()
	switch {
	case id > 0:
		r.lastID = id
		r.recent = append(r.recent, message{id: id, raw: msg})
		if len(r.recent) > keep {
			r.recent = r.recent[len(r.recent)-keep:]
		}
	case strings.Contains(data, `"type":"status"`):
		r.status = msg
	}
	for ch := range r.subs {
		select {
		case ch <- msg:
		default:
			// A browser this far behind refetches when it catches up.
		}
	}
}

// ServeHTTP streams to a browser: the latest status, the events after its
// Last-Event-ID, then new messages, with a keepalive every 15 s.
func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	after, _ := strconv.ParseUint(req.Header.Get("Last-Event-ID"), 10, 64)
	ch := make(chan []byte, 64)
	r.mu.Lock()
	var backlog [][]byte
	if r.status != nil {
		backlog = append(backlog, r.status)
	}
	if after > 0 {
		for _, m := range r.recent {
			if m.id > after {
				backlog = append(backlog, m.raw)
			}
		}
	}
	r.subs[ch] = struct{}{}
	r.mu.Unlock()
	metrics.EventClients.Inc()
	defer metrics.EventClients.Dec()
	defer func() {
		r.mu.Lock()
		delete(r.subs, ch)
		r.mu.Unlock()
	}()

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	write := func(msg []byte) error {
		if _, err := w.Write(msg); err != nil {
			return err
		}
		return rc.Flush()
	}
	if write([]byte("retry: 3000\n\n")) != nil {
		return
	}
	for _, msg := range backlog {
		if write(msg) != nil {
			return
		}
	}
	tick := time.NewTicker(15 * time.Second)
	defer tick.Stop()
	for {
		select {
		case <-req.Context().Done():
			return
		case msg := <-ch:
			if write(msg) != nil {
				return
			}
		case <-tick.C:
			if write([]byte(": keepalive\n\n")) != nil {
				return
			}
		}
	}
}

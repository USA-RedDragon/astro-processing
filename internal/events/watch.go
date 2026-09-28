package events

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"slices"
	"time"

	"gorm.io/gorm"
)

// Change is sent when Target Scheduler tables change, so pages reload the
// stats read from them.
type Change struct {
	Type   string   `json:"type"` // "data"
	Tables []string `json:"tables"`
	Time   string   `json:"time"`
}

// fingerprints are cheap queries that change whenever a table's rows do.
// acquiredimage is large, so it's summarized: new images raise the count
// and highest ID, and grading changes move the sum of grading statuses.
// The small tables are hashed whole (PostgreSQL); elsewhere they fall back
// to their row counts.
var fingerprints = []struct {
	table    string
	postgres string
	portable string
}{
	{"acquiredimage",
		`SELECT count(*) || ':' || coalesce(max("Id"), 0) || ':' || coalesce(sum("gradingStatus"), 0) FROM acquiredimage`,
		`SELECT count(*) FROM acquiredimage`},
	{"exposureplan", `SELECT md5(string_agg(t::text, ',' ORDER BY t."Id")) FROM exposureplan t`, `SELECT count(*) FROM exposureplan`},
	{"project", `SELECT md5(string_agg(t::text, ',' ORDER BY t."Id")) FROM project t`, `SELECT count(*) FROM project`},
	{"target", `SELECT md5(string_agg(t::text, ',' ORDER BY t."Id")) FROM target t`, `SELECT count(*) FROM target`},
	{"exposuretemplate", `SELECT md5(string_agg(t::text, ',' ORDER BY t."Id")) FROM exposuretemplate t`, `SELECT count(*) FROM exposuretemplate`},
	{"flathistory", `SELECT md5(string_agg(t::text, ',' ORDER BY t."Id")) FROM flathistory t`, `SELECT count(*) FROM flathistory`},
}

// WatchScheduler polls the Target Scheduler tables every interval and
// publishes a Change naming the tables that changed since the last poll.
func (r *Relay) WatchScheduler(ctx context.Context, db *gorm.DB, interval time.Duration) {
	postgres := db.Name() == "postgres"
	var prev map[string]string
	for {
		cur := map[string]string{}
		for _, f := range fingerprints {
			q := f.portable
			if postgres {
				q = f.postgres
			}
			var v *string
			if err := db.WithContext(ctx).Raw(q).Scan(&v).Error; err != nil {
				if ctx.Err() != nil {
					return
				}
				slog.Debug("Could not fingerprint table", "table", f.table, "error", err)
				continue
			}
			if v != nil {
				cur[f.table] = *v
			}
		}
		if prev != nil {
			var changed []string
			for t, v := range cur {
				if prev[t] != v {
					changed = append(changed, t)
				}
			}
			if len(changed) > 0 {
				slices.Sort(changed)
				r.Publish(Change{Type: "data", Tables: changed, Time: time.Now().UTC().Format(time.RFC3339)})
			}
		}
		prev = cur
		select {
		case <-ctx.Done():
			return
		case <-time.After(interval):
		}
	}
}

// Publish sends a message of the backend's own to browsers. It carries no
// event ID, so it isn't replayed; browsers reload after reconnecting.
func (r *Relay) Publish(v any) {
	data, err := json.Marshal(v)
	if err != nil {
		slog.Warn("Could not encode event", "error", fmt.Sprint(err))
		return
	}
	r.dispatch(0, string(data))
}

package events

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func TestWatchSchedulerReportsChangedTables(t *testing.T) {
	t.Parallel()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// Each connection to :memory: is its own database; share one.
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	for _, table := range []string{"acquiredimage", "exposureplan", "project", "target", "exposuretemplate", "flathistory"} {
		if err := db.Exec(`CREATE TABLE ` + table + ` ("Id" INTEGER PRIMARY KEY, x INTEGER)`).Error; err != nil {
			t.Fatal(err)
		}
	}
	relay := NewRelay()
	ch := make(chan []byte, 8)
	relay.mu.Lock()
	relay.subs[ch] = struct{}{}
	relay.mu.Unlock()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go relay.WatchScheduler(ctx, db, 20*time.Millisecond)
	time.Sleep(60 * time.Millisecond) // first poll only records
	if err := db.Exec(`INSERT INTO acquiredimage VALUES (1, 0)`).Error; err != nil {
		t.Fatal(err)
	}
	select {
	case msg := <-ch:
		if !strings.Contains(string(msg), `"type":"data","tables":["acquiredimage"]`) {
			t.Fatalf("got %s", msg)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no change event")
	}
}

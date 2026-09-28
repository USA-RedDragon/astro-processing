// Package metrics holds the backend's Prometheus metrics.
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

const ns = "astro_processing"

var (
	EventClients = promauto.NewGauge(prometheus.GaugeOpts{Namespace: ns, Name: "event_clients",
		Help: "Browsers following the event stream."})
	WorkerStreamConnected = promauto.NewGauge(prometheus.GaugeOpts{Namespace: ns, Name: "worker_stream_connected",
		Help: "1 while the worker's event stream is connected."})
	WorkerEvents = promauto.NewCounter(prometheus.CounterOpts{Namespace: ns, Name: "worker_events_total",
		Help: "Messages relayed from the worker's event stream."})
	TableChanges = promauto.NewCounterVec(prometheus.CounterOpts{Namespace: ns, Name: "table_changes_total",
		Help: "Scheduler table changes seen by the watcher."}, []string{"table"})
	WorkerRequestSeconds = promauto.NewHistogramVec(prometheus.HistogramOpts{Namespace: ns, Name: "worker_request_seconds",
		Help: "Worker API calls, by endpoint and result.", Buckets: prometheus.DefBuckets}, []string{"endpoint", "result"})
)

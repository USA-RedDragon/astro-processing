package resolvers

import (
	"context"
	"log/slog"
	"sort"

	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

// leastRank orders projects the way the UI does: enough data first, then measured progress, then a filter not
// measured yet, then no enabled exposure plans.
func leastRank(l workerclient.Least) float64 {
	switch {
	case l.Filters == 0:
		return -2
	case l.Enough:
		return 1
	case l.Progress == nil:
		return -1
	}
	return *l.Progress
}

// orderByLeast sorts projects by their least complete filter, keeping the incoming order for ties and putting
// projects the snapshot does not know last.
func orderByLeast(projects []targetscheduler.Project, leasts []workerclient.ProjectLeast, desc bool) {
	rank := make(map[int]float64, len(leasts))
	for _, p := range leasts {
		rank[p.ID] = leastRank(p.Least)
	}
	sort.SliceStable(projects, func(i, j int) bool {
		a, okA := rank[projects[i].ID]
		b, okB := rank[projects[j].ID]
		if !okA || !okB {
			return okA && !okB
		}
		if desc {
			return a > b
		}
		return a < b
	})
}

func (r *Resolver) sortByLeast(ctx context.Context, projects []targetscheduler.Project, desc bool) {
	if r.worker == nil {
		return
	}
	leasts, err := r.worker.ProjectLeasts(ctx)
	if err != nil {
		slog.Warn("progress order: no planning snapshot, keeping name order", "error", err)
		return
	}
	orderByLeast(projects, leasts, desc)
}

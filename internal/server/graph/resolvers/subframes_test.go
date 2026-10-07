package resolvers

import (
	"math"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/submeta"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func sub(id int, file string, grading int, reason string) subframe {
	s := subframe{
		row: subframeRow{ID: id, FilterName: "L", GradingStatus: grading},
		meta: submeta.Metadata{
			FileName: `A:\NINA\Orion\LIGHT\` + file, FilterName: "L", ExposureDuration: 300,
			HFR: 2, DetectedStars: 100, FWHM: submeta.Float(math.NaN()), ADUMedian: 700,
		},
		sky: 194,
	}
	if reason != "" {
		s.row.RejectReason = &reason
	}
	return s
}

func stackerFixture() map[string]*workerclient.Sub {
	return indexStackerSubs([]workerclient.Sub{
		{File: "added.fits", Status: "added", Score: 0.8, Weight: 240, Photometry: "measured"},
		{File: "hazy.fits", Status: "low_score", Score: 0.05, Photometry: "measured"},
		{File: "verdict.fits", Status: "moon", Score: 0.6, Photometry: "pending"},
		{File: "off.fits", Status: "off_target", Score: 0.5, Error: "pointed 2.1° off"},
		{File: "unseen.fits", Photometry: "pending"},
		{File: "byhand.fits", Status: "rejected"},
		// The duplicate of a file names the original's result.
		{File: "twin.fits", Status: "duplicate"},
		{File: "twin.fits", Status: "added", Score: 0.5, Weight: 150},
	})
}

func TestToModelSubframeShowsStackerVerdict(t *testing.T) {
	t.Parallel()
	subs := []subframe{
		sub(1, "added.fits", gradingAccepted, ""),
		sub(2, "hazy.fits", gradingAccepted, ""),
		sub(3, "verdict.fits", gradingRejected, "stacker: moon"),
		sub(4, "off.fits", gradingAccepted, ""),
		sub(5, "unseen.fits", gradingPending, ""),
		sub(6, "missing.fits", gradingAccepted, ""),
		sub(7, "byhand.fits", gradingRejected, "Bad guiding"),
		sub(8, "twin.fits", gradingAccepted, ""),
	}
	matchStacker(subs, stackerFixture())

	type want struct {
		status     string
		score      *float64
		weight     *float64
		reason     string
		photometry string
	}
	f := func(v float64) *float64 { return &v }
	wants := map[int]want{
		1: {status: "added", score: f(0.8), weight: f(240), photometry: "measured"},
		2: {status: "low_score", score: f(0.05), weight: f(0), reason: statusReasons["low_score"], photometry: "measured"},
		// Rejected in TS by the stacker's verdict: the stacker's status, not 0.
		3: {status: "moon", score: f(0.6), weight: f(0), reason: statusReasons["moon"], photometry: "pending"},
		4: {status: "off_target", score: f(0.5), weight: f(0), reason: "pointed 2.1° off"},
		// Not processed yet: pending, not a score of 0.
		5: {status: "pending", reason: "Not processed by the stacker yet", photometry: "pending"},
		6: {status: "pending", reason: "Not in the stacker's index yet"},
		7: {status: "rejected", reason: "Rejected in Target Scheduler: Bad guiding"},
		8: {status: "added", score: f(0.5), weight: f(150)},
	}
	for _, s := range subs {
		m := toModelSubframe(s)
		w := wants[s.row.ID]
		if m.StackStatus != w.status {
			t.Errorf("sub %d: status %q, want %q", s.row.ID, m.StackStatus, w.status)
		}
		if !samePtr(m.Score, w.score) || !samePtr(m.Weight, w.weight) {
			t.Errorf("sub %d: score %v weight %v, want %v %v", s.row.ID, deref(m.Score), deref(m.Weight), deref(w.score), deref(w.weight))
		}
		if got := derefS(m.StackReason); got != w.reason {
			t.Errorf("sub %d: reason %q, want %q", s.row.ID, got, w.reason)
		}
		if got := derefS(m.Photometry); got != w.photometry {
			t.Errorf("sub %d: photometry %q, want %q", s.row.ID, got, w.photometry)
		}
		if m.FileName == nil || *m.FileName == "" || m.FilterName != "L" || *m.ExposureTime != 300 {
			t.Errorf("sub %d: metadata lost: %+v", s.row.ID, m)
		}
	}
}

func TestSummarizeQualityUsesStackerWeights(t *testing.T) {
	t.Parallel()
	subs := []subframe{
		sub(1, "added.fits", gradingAccepted, ""),
		sub(2, "hazy.fits", gradingAccepted, ""),
		sub(3, "verdict.fits", gradingRejected, "stacker: moon"),
		sub(5, "unseen.fits", gradingPending, ""),
		sub(7, "byhand.fits", gradingRejected, "Bad guiding"),
		sub(8, "twin.fits", gradingAccepted, ""),
		// Rejected by hand and never seen by the stacker: still left out.
		sub(9, "gone.fits", gradingRejected, "Clouds"),
	}
	matchStacker(subs, stackerFixture())
	q := summarizeQuality(subs)
	if len(q) != 1 {
		t.Fatalf("got %d groups, want 1", len(q))
	}
	g := q[0]
	if g.FilterName != "L" || g.ExposureTime != 300 {
		t.Errorf("group %s %v", g.FilterName, g.ExposureTime)
	}
	// added, hazy, verdict, unseen, twin: all but the two rejected by hand.
	if g.Subframes != 5 || g.Stacked != 2 || g.Pending != 1 {
		t.Errorf("subframes %d stacked %d pending %d, want 5 2 1", g.Subframes, g.Stacked, g.Pending)
	}
	if want := 5 * 300.0 / 3600; math.Abs(g.NominalHours-want) > 1e-9 {
		t.Errorf("nominal %v, want %v", g.NominalHours, want)
	}
	// The stacked subs' weights: 240 s + 150 s.
	if want := 390.0 / 3600; math.Abs(g.EffectiveHours-want) > 1e-9 {
		t.Errorf("effective %v, want %v", g.EffectiveHours, want)
	}
}

func TestStackerUnavailableShowsPending(t *testing.T) {
	t.Parallel()
	subs := []subframe{sub(1, "added.fits", gradingAccepted, "")}
	matchStacker(subs, nil)
	m := toModelSubframe(subs[0])
	if m.StackStatus != statusPending || m.Score != nil || m.Weight != nil {
		t.Errorf("got %+v", m)
	}
	if q := summarizeQuality(subs); q[0].EffectiveHours != 0 || q[0].Pending != 1 {
		t.Errorf("got %+v", q[0])
	}
}

func samePtr(a, b *float64) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func deref(p *float64) any {
	if p == nil {
		return nil
	}
	return *p
}

func derefS(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

package resolvers

import (
	"math"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/submeta"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

const (
	photometryMeasured = "measured"
	photometryPending  = "pending"
)

func sub(id int, file string, grading int, reason string) subframe {
	s := subframe{
		row: subframeRow{ID: id, FilterName: "L", GradingStatus: grading},
		meta: submeta.Metadata{
			FileName: `A:\NINA\Orion\LIGHT\` + file, FilterName: "L", ExposureDuration: 300,
			HFR: 2, DetectedStars: 100, FWHM: submeta.Float(math.NaN()), ADUMedian: 700,
		},
	}
	if reason != "" {
		s.row.RejectReason = &reason
	}
	return s
}

func fp(v float64) *float64 { return &v }

func stackerFixture() map[string]*workerclient.Sub {
	sc := &workerclient.Scoring{MinScore: 0.3, TargetBest: fp(0.8), Cut: fp(0.24), SkyADU: fp(194), PedestalADU: fp(506),
		PedestalSource: "configured", PedestalBasis: "configured 506 ADU at offset 50"}
	return indexStackerSubs([]workerclient.Sub{
		{File: "added.fits", Filter: "L", Status: statusAdded, Score: fp(0.8), Weight: fp(240), Photometry: photometryMeasured, Scoring: sc},
		{File: "hazy.fits", Filter: "L", Status: statusLowScore, Score: fp(0.05), Weight: fp(0), Photometry: photometryMeasured, Scoring: sc},
		{File: "verdict.fits", Filter: "L", Status: statusMoon, Score: fp(0.6), Weight: fp(0), Photometry: photometryPending,
			Error: "the Moon was 20° from the target at mid-exposure; the filter's moon avoidance needed 60°", Scoring: sc},
		{File: "off.fits", Filter: "L", Status: "off_target", Score: fp(0.5), Weight: fp(0), Error: "pointed 2.1° off", Scoring: sc},
		{File: "unseen.fits", Filter: "L", Photometry: photometryPending, Scoring: sc},
		{File: "byhand.fits", Filter: "L", Status: "rejected", Score: fp(0), Weight: fp(0)},
		{File: "dark.fits", Filter: "L", Status: statusUnmeasured, Score: fp(0), Weight: fp(0), Error: "not measured: no HFR",
			Scoring: &workerclient.Scoring{MinScore: 0.3, Unmeasured: "no HFR", SkyADU: fp(30)}},
		{File: "twin.fits", Filter: "L", Status: "duplicate", Score: fp(0), Weight: fp(0)},
		{File: "twin.fits", Filter: "L", Status: statusAdded, Score: fp(0.5), Weight: fp(150), Scoring: sc},
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
		sub(9, "dark.fits", gradingAccepted, ""),
	}
	matchStacker(subs, stackerFixture())

	type want struct {
		status     string
		score      *float64
		weight     *float64
		reason     string
		photometry string
	}
	f := fp
	wants := map[int]want{
		1: {status: statusAdded, score: f(0.8), weight: f(240), photometry: photometryMeasured},
		2: {status: statusLowScore, score: f(0.05), weight: f(0),
			reason: "score 0.05 is under the cut 0.24 as scored now: 0.3 × the target's best L score, 0.80", photometry: photometryMeasured},
		3: {status: statusMoon, score: f(0.6), weight: f(0),
			reason: "the Moon was 20° from the target at mid-exposure; the filter's moon avoidance needed 60°", photometry: photometryPending},
		4: {status: "off_target", score: f(0.5), weight: f(0), reason: "pointed 2.1° off"},
		5: {status: statusPending, reason: "Not processed by the stacker yet", photometry: photometryPending},
		6: {status: statusPending, reason: "Not in the stacker's index yet"},
		7: {status: "rejected", reason: "Rejected in Target Scheduler: Bad guiding"},
		8: {status: statusAdded, score: f(0.5), weight: f(150)},
		9: {status: statusUnmeasured, reason: "not measured: no HFR"},
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
	if g.RejectedInScheduler != 2 || g.BelowCut != 1 || deref(g.Cut) != 0.24 || deref(g.MedianSky) != 194.0 || g.SkyBasis == nil {
		t.Errorf("rejected %d below cut %d cut %v sky %v basis %v", g.RejectedInScheduler, g.BelowCut, deref(g.Cut), deref(g.MedianSky), g.SkyBasis)
	}
	if want := 5 * 300.0 / 3600; math.Abs(g.NominalHours-want) > 1e-9 {
		t.Errorf("nominal %v, want %v", g.NominalHours, want)
	}
	// The stacked subs' weights: 240 s + 150 s.
	if want := 390.0 / 3600; math.Abs(g.EffectiveHours-want) > 1e-9 {
		t.Errorf("effective %v, want %v", g.EffectiveHours, want)
	}
}

func TestStackerUnreachableSaysSo(t *testing.T) {
	t.Parallel()
	subs := []subframe{sub(1, "added.fits", gradingAccepted, "")}
	subs[0].unreachable = "dial tcp: connection refused"
	m := toModelSubframe(subs[0])
	want := "Stacker unreachable: dial tcp: connection refused"
	if m.StackStatus != statusUnreachable || m.Score != nil || derefS(m.StackReason) != want || derefS(m.ScoreMissing) != want || m.Sky != nil {
		t.Errorf("got %+v", m)
	}
	if q := summarizeQuality(subs); q[0].EffectiveHours != 0 || q[0].Pending != 1 {
		t.Errorf("got %+v", q[0])
	}
}

func TestSubframeCarriesStackerInputs(t *testing.T) {
	t.Parallel()
	subs := []subframe{sub(1, "added.fits", gradingAccepted, ""), sub(2, "missing.fits", gradingAccepted, "")}
	matchStacker(subs, stackerFixture())
	m := toModelSubframe(subs[0])
	if deref(m.Sky) != 194.0 || deref(m.PedestalAdu) != 506.0 || deref(m.Cut) != 0.24 || m.Transparency != nil {
		t.Errorf("got %+v", m)
	}
	m = toModelSubframe(subs[1])
	if m.Sky != nil || derefS(m.SkyMissing) != "Not in the stacker's index yet" {
		t.Errorf("got %+v", m)
	}
}

func TestScopeMastersCountsThisTarget(t *testing.T) {
	t.Parallel()
	subs := []subframe{sub(1, "added.fits", gradingAccepted, ""), sub(2, "hazy.fits", gradingAccepted, "")}
	stacker := []workerclient.Sub{
		{File: "added.fits", Filter: "L", Status: statusAdded, Score: fp(0.8)},
		{File: "hazy.fits", Filter: "L", Status: statusLowScore},
		{File: "other.fits", Filter: "L", Status: statusAdded},
		{File: "other2.fits", Filter: "L", Status: statusAdded},
	}
	matchStacker(subs, indexStackerSubs(stacker))
	masters := []*model.FilterMaster{{Filter: "L", Subs: 3}}
	scopeMasters(masters, subs, stacker)
	if *masters[0].ObjectLights != 4 || *masters[0].TargetSubs != 1 {
		t.Errorf("object lights %d, target subs %d, want 4 and 1", *masters[0].ObjectLights, *masters[0].TargetSubs)
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

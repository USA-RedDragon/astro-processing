package resolvers

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"path"
	"slices"
	"sort"
	"strings"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/submeta"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
	"gorm.io/gorm"
)

const (
	gradingPending  = 0
	gradingAccepted = 1
	gradingRejected = 2
)

// stackerReasonPrefix starts the reject reason of subs the stacker rejected
// in Target Scheduler itself (its verdicts).
const stackerReasonPrefix = "stacker:"

const (
	statusPending     = "pending"
	statusAdded       = "added"
	statusRejected    = "rejected"
	statusNoMetadata  = "no_metadata"
	statusDuplicate   = "duplicate"
	statusLowScore    = "low_score"
	statusUnmeasured  = "unmeasured"
	statusMoon        = "moon"
	statusUnreachable = "unreachable"
)

func statusMeaning(status string) string {
	switch status {
	case "off_target":
		return "The mount pointed elsewhere and the sub didn't register"
	case statusNoMetadata:
		return "No Target Scheduler record to score it"
	case "calibration":
		return "Waiting for matching calibration frames"
	case "registration":
		return "Didn't register to the target's reference"
	case "failed":
		return "Processing failed; the stacker will try again"
	case "dead":
		return "Failed too often; left out until reset"
	case "recalibrate":
		return "Being calibrated again with a better dark"
	case statusDuplicate:
		return "The same file as an earlier light"
	case statusMoon:
		return "Breaks its filter's moon avoidance; the stacker recorded no separation when it left it out"
	}
	return ""
}

type qualityGroup struct {
	filter   string
	exposure float64
}

type subframeRow struct {
	ID            int
	AcquiredDate  *int32
	FilterName    string
	GradingStatus int
	RejectReason  *string
	Metadata      string
}

type subframe struct {
	row         subframeRow
	meta        submeta.Metadata
	stack       *workerclient.Sub
	unreachable string
}

func (s subframe) group() qualityGroup {
	filter := s.meta.FilterName
	if filter == "" {
		filter = s.row.FilterName
	}
	return qualityGroup{filter: filter, exposure: math.Round(float64(s.meta.ExposureDuration))}
}

func (s subframe) fileName() string {
	return s.meta.FileName[strings.LastIndexAny(s.meta.FileName, `\/`)+1:]
}

func (s subframe) status() string {
	if s.unreachable != "" {
		return statusUnreachable
	}
	if s.stack == nil || s.stack.Status == "" {
		return statusPending
	}
	return s.stack.Status
}

func (s subframe) scored() bool {
	switch s.status() {
	case statusPending, statusRejected, statusNoMetadata, statusDuplicate, statusUnmeasured, statusUnreachable:
		return false
	}
	return s.stack.Score != nil
}

func (s subframe) scoring() *workerclient.Scoring {
	if s.stack == nil {
		return nil
	}
	return s.stack.Scoring
}

func (s subframe) rejectedInScheduler() bool {
	return s.row.GradingStatus == gradingRejected &&
		(s.row.RejectReason == nil || !strings.HasPrefix(*s.row.RejectReason, stackerReasonPrefix))
}

func (s subframe) notInStacker() string {
	switch {
	case s.unreachable != "":
		return "Stacker unreachable: " + s.unreachable
	case s.stack == nil:
		return "Not in the stacker's index yet"
	case s.stack.Scoring == nil && s.stack.NoScoring != "":
		return "The stacker has no score inputs for it: " + s.stack.NoScoring
	case s.stack.Scoring == nil:
		return "The stacker sent no score inputs"
	}
	return ""
}

func (s subframe) lowScoreReason() string {
	sc := s.scoring()
	if sc == nil || sc.Cut == nil || sc.TargetBest == nil || s.stack.Score == nil {
		return ""
	}
	return fmt.Sprintf("score %.2f is under the cut %.2f as scored now: %g × the target's best %s score, %.2f",
		*s.stack.Score, *sc.Cut, sc.MinScore, s.stack.Filter, *sc.TargetBest)
}

func (s subframe) reason() *string {
	var why string
	switch st := s.status(); st {
	case statusAdded:
		return nil
	case statusUnreachable:
		why = s.notInStacker()
	case statusPending:
		why = "Not processed by the stacker yet"
		if s.stack == nil {
			why = "Not in the stacker's index yet"
		}
	case statusRejected:
		why = "Rejected in Target Scheduler"
		if s.row.RejectReason != nil && *s.row.RejectReason != "" {
			why += ": " + *s.row.RejectReason
		}
	default:
		why = s.stack.Error
		switch {
		case why != "":
		case st == statusLowScore:
			why = s.lowScoreReason()
		case st == statusUnmeasured && s.scoring() != nil && s.scoring().Unmeasured != "":
			why = "not measured: " + s.scoring().Unmeasured
		default:
			why = statusMeaning(st)
		}
		if why == "" {
			why = "The stacker recorded no reason"
		}
	}
	return optional(why)
}

func (s subframe) scoreMissing() *string {
	if s.scored() {
		return nil
	}
	switch st := s.status(); st {
	case statusUnreachable:
		return optional(s.notInStacker())
	case statusPending:
		return s.reason()
	case statusRejected:
		return optional("Rejected in Target Scheduler; the stacker doesn't score it")
	case statusDuplicate:
		return optional("A duplicate of an earlier light; not scored")
	case statusUnmeasured, statusNoMetadata:
		return s.reason()
	}
	return optional("The stacker recorded no score")
}

func (s subframe) sky() (*float64, *string) {
	if why := s.notInStacker(); why != "" {
		return nil, &why
	}
	sc := s.scoring()
	if sc.SkyADU != nil {
		return sc.SkyADU, nil
	}
	if sc.Unmeasured != "" {
		return nil, optional(sc.Unmeasured)
	}
	return nil, optional("No sky above the pedestal")
}

func (r *Resolver) loadSubframes(db *gorm.DB, targetID int) ([]subframe, error) {
	var rows []subframeRow
	if err := db.Table("acquiredimage").
		Select(`"Id" as id, acquireddate as acquired_date, filtername as filter_name,
			"gradingStatus" as grading_status, rejectreason as reject_reason, metadata`).
		Where(`"targetId" = ?`, targetID).
		Order("acquireddate").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to load subframes: %w", err)
	}

	subs := make([]subframe, 0, len(rows))
	for _, row := range rows {
		meta, err := submeta.ParseMetadata(row.Metadata)
		if err != nil {
			nan := submeta.Float(math.NaN())
			meta = submeta.Metadata{ExposureDuration: nan, HFR: nan, ADUMedian: nan}
		}
		subs = append(subs, subframe{row: row, meta: meta})
	}
	return subs, nil
}

func (r *Resolver) stackerSubs(ctx context.Context, object string) ([]workerclient.Sub, string) {
	if r.worker == nil {
		return nil, "no stacker is configured"
	}
	subs, err := r.worker.Subs(ctx, object)
	if err != nil {
		slog.Warn("Could not load the stacker's subs", "target", object, "error", err)
		return nil, err.Error()
	}
	return subs, ""
}

func indexStackerSubs(subs []workerclient.Sub) map[string]*workerclient.Sub {
	out := make(map[string]*workerclient.Sub, len(subs))
	for i := range subs {
		s := &subs[i]
		name := path.Base(s.File)
		if prev, ok := out[name]; ok && prev.Status != statusDuplicate {
			continue
		}
		out[name] = s
	}
	return out
}

func (r *Resolver) targetSubframes(ctx context.Context, targetID int, name string) ([]subframe, []workerclient.Sub, error) {
	subs, err := r.loadSubframes(r.db.WithContext(ctx), targetID)
	if err != nil {
		return nil, nil, err
	}
	stacker, unreachable := r.stackerSubs(ctx, name)
	if unreachable != "" {
		for i := range subs {
			subs[i].unreachable = unreachable
		}
		return subs, nil, nil
	}
	matchStacker(subs, indexStackerSubs(stacker))
	return subs, stacker, nil
}

func matchStacker(subs []subframe, stacker map[string]*workerclient.Sub) {
	for i := range subs {
		if f := subs[i].fileName(); f != "" {
			subs[i].stack = stacker[f]
		}
	}
}

func finite(v float64) *float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return &v
}

func gradingStatus(v int) model.GradingStatus {
	switch v {
	case gradingAccepted:
		return model.GradingStatusAccepted
	case gradingRejected:
		return model.GradingStatusRejected
	default:
		return model.GradingStatusPending
	}
}

func toModelSubframe(s subframe) *model.Subframe {
	acquired := s.row.AcquiredDate
	var stars *int32
	if v := float64(s.meta.DetectedStars); !math.IsNaN(v) {
		n := int32(v)
		stars = &n
	}
	out := &model.Subframe{
		ID:               s.row.ID,
		AcquiredDate:     acquired,
		FilterName:       s.group().filter,
		ExposureTime:     finite(float64(s.meta.ExposureDuration)),
		GradingStatus:    gradingStatus(s.row.GradingStatus),
		RejectReason:     s.row.RejectReason,
		FileName:         optional(s.fileName()),
		Hfr:              finite(float64(s.meta.HFR)),
		Fwhm:             finite(float64(s.meta.FWHM)),
		Stars:            stars,
		Eccentricity:     finite(float64(s.meta.Eccentricity)),
		GuidingRmsArcsec: finite(float64(s.meta.GuidingRMSArcSec)),
		Airmass:          finite(float64(s.meta.Airmass)),
		StackStatus:      s.status(),
		StackReason:      s.reason(),
	}
	out.Sky, out.SkyMissing = s.sky()
	out.ScoreMissing = s.scoreMissing()
	if s.stack != nil {
		out.Photometry = optional(s.stack.Photometry)
	}
	if s.scored() {
		out.Score, out.Weight = s.stack.Score, s.stack.Weight
	}
	if sc := s.scoring(); sc != nil {
		out.PedestalAdu = sc.PedestalADU
		out.PedestalSource = optional(sc.PedestalSource)
		out.PedestalBasis = optional(sc.PedestalBasis)
		out.Transparency = sc.Transparency
		out.TransparencySource = optional(sc.TransparencySource)
		out.TransparencyMissing = optional(sc.TransparencyMissing)
		out.TargetBest, out.Cut = sc.TargetBest, sc.Cut
	}
	return out
}

func median(vals []float64) *float64 {
	clean := make([]float64, 0, len(vals))
	for _, v := range vals {
		if !math.IsNaN(v) {
			clean = append(clean, v)
		}
	}
	if len(clean) == 0 {
		return nil
	}
	sort.Float64s(clean)
	m := clean[len(clean)/2]
	if len(clean)%2 == 0 {
		m = (clean[len(clean)/2-1] + clean[len(clean)/2]) / 2
	}
	return &m
}

func summarizeQuality(subs []subframe) []*model.FilterQuality {
	type acc struct {
		out   *model.FilterQuality
		sky   []float64
		hfr   []float64
		bases []string
	}
	groups := map[qualityGroup]*acc{}
	var order []qualityGroup
	get := func(g qualityGroup) *acc {
		a, ok := groups[g]
		if !ok {
			a = &acc{out: &model.FilterQuality{FilterName: g.filter, ExposureTime: g.exposure}}
			groups[g] = a
			order = append(order, g)
		}
		return a
	}
	for _, s := range subs {
		st := s.status()
		if st == statusDuplicate {
			continue
		}
		a := get(s.group())
		if s.rejectedInScheduler() || st == statusRejected {
			a.out.RejectedInScheduler++
			continue
		}
		g := s.group()
		a.out.Subframes++
		if !math.IsNaN(g.exposure) {
			a.out.NominalHours += g.exposure / 3600
		}
		switch st {
		case statusPending, statusUnreachable:
			a.out.Pending++
		case statusAdded:
			a.out.Stacked++
			if w := s.stack.Weight; w != nil && *w > 0 {
				a.out.EffectiveHours += *w / 3600
			}
		case statusLowScore:
			a.out.BelowCut++
		case statusUnmeasured:
			a.out.Unmeasured++
		}
		if sky, _ := s.sky(); sky != nil {
			a.sky = append(a.sky, *sky)
		}
		if sc := s.scoring(); sc != nil {
			if sc.PedestalBasis != "" && !slices.Contains(a.bases, sc.PedestalBasis) {
				a.bases = append(a.bases, sc.PedestalBasis)
			}
			if a.out.MinScore == nil {
				a.out.MinScore = &sc.MinScore
			}
			if a.out.TargetBest == nil && sc.TargetBest != nil {
				a.out.TargetBest, a.out.Cut = sc.TargetBest, sc.Cut
			}
			if a.out.ReferenceWeight == nil && sc.ReferenceWeight != nil {
				n, pct := sc.ReferenceSubs, sc.ReferencePercentile
				a.out.ReferenceWeight, a.out.ReferenceSubs, a.out.ReferencePercentile = sc.ReferenceWeight, &n, &pct
			}
		}
		a.hfr = append(a.hfr, float64(s.meta.HFR))
	}
	sort.Slice(order, func(i, j int) bool {
		if order[i].filter != order[j].filter {
			return order[i].filter < order[j].filter
		}
		return order[i].exposure < order[j].exposure
	})
	out := make([]*model.FilterQuality, 0, len(order))
	for _, g := range order {
		a := groups[g]
		a.out.MedianSky = median(a.sky)
		a.out.MedianHfr = median(a.hfr)
		if len(a.bases) > 0 {
			a.out.SkyBasis = optional("ADU median less the pedestal: " + strings.Join(a.bases, "; "))
		}
		out = append(out, a.out)
	}
	return out
}

func scopeMasters(masters []*model.FilterMaster, subs []subframe, stacker []workerclient.Sub) {
	lights := map[string]int32{}
	for _, s := range stacker {
		if s.Status != statusDuplicate {
			lights[s.Filter]++
		}
	}
	mine := map[string]int32{}
	for _, s := range subs {
		if s.status() == statusAdded {
			mine[s.stack.Filter]++
		}
	}
	for _, m := range masters {
		n, k := lights[m.Filter], mine[m.Filter]
		m.ObjectLights, m.TargetSubs = &n, &k
	}
}

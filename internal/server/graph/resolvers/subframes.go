package resolvers

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"path"
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

// The stacker's statuses this package treats specially; the rest are shown
// as they come. statusPending is ours: the stacker hasn't processed the sub.
const (
	statusPending    = "pending"
	statusAdded      = "added"
	statusRejected   = "rejected"
	statusNoMetadata = "no_metadata"
	statusDuplicate  = "duplicate"
)

// statusReasons explains a stacker status that came without an error.
var statusReasons = map[string]string{
	"low_score":      "Scored below the stacker's cut against this target's best subs",
	"moon":           "Breaks its filter's moon avoidance",
	"off_target":     "The mount pointed elsewhere and the sub didn't register",
	statusNoMetadata: "No Target Scheduler record to score it",
	"calibration":    "Waiting for matching calibration frames",
	"registration":   "Didn't register to the target's reference",
	"failed":         "Processing failed; the stacker will try again",
	"dead":           "Failed too often; left out until reset",
	"recalibrate":    "Being calibrated again with a better dark",
	statusDuplicate:  "The same file as an earlier light",
}

type qualityGroup struct {
	filter   string
	exposure float64
}

type subframeRow struct {
	ID            int
	AcquiredDate  *int
	FilterName    string
	GradingStatus int
	RejectReason  *string
	Metadata      string
}

// subframe is an acquired image with what the stacker made of it; stack is
// nil when the stacker has no light of that name.
type subframe struct {
	row   subframeRow
	meta  submeta.Metadata
	sky   float64
	stack *workerclient.Sub
}

func (s subframe) group() qualityGroup {
	filter := s.meta.FilterName
	if filter == "" {
		filter = s.row.FilterName
	}
	return qualityGroup{filter: filter, exposure: math.Round(float64(s.meta.ExposureDuration))}
}

// fileName is the base name of the sub's file. NINA records Windows paths;
// the base name is what matches files in the object store.
func (s subframe) fileName() string {
	return s.meta.FileName[strings.LastIndexAny(s.meta.FileName, `\/`)+1:]
}

// status is the stacker's status for the sub, or statusPending.
func (s subframe) status() string {
	if s.stack == nil || s.stack.Status == "" {
		return statusPending
	}
	return s.stack.Status
}

// scored reports whether the stacker's score means anything: it scores
// neither subs Target Scheduler rejected, nor ones it has no record of, nor
// duplicate files.
func (s subframe) scored() bool {
	switch s.status() {
	case statusPending, statusRejected, statusNoMetadata, statusDuplicate:
		return false
	}
	return true
}

// rejectedInScheduler reports a sub rejected in Target Scheduler other than
// by the stacker's verdicts, which the stacker leaves out without judging.
func (s subframe) rejectedInScheduler() bool {
	return s.row.GradingStatus == gradingRejected &&
		(s.row.RejectReason == nil || !strings.HasPrefix(*s.row.RejectReason, stackerReasonPrefix))
}

func (s subframe) reason() *string {
	var why string
	switch st := s.status(); st {
	case statusAdded:
		return nil
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
		if why == "" {
			why = statusReasons[st]
		}
	}
	return optional(why)
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
			// Keep the sub so counts stay honest.
			nan := submeta.Float(math.NaN())
			meta = submeta.Metadata{ExposureDuration: nan, HFR: nan, ADUMedian: nan}
		}
		subs = append(subs, subframe{
			row:  row,
			meta: meta,
			sky:  submeta.Sky(float64(meta.ADUMedian), submeta.PedestalAt(r.config.Quality.Pedestal, float64(meta.Offset))),
		})
	}
	return subs, nil
}

// stackerSubs is the stacker's lights of a target by file name. It is nil
// when the stacker is not configured or can't be reached, so every sub
// shows as pending.
func (r *Resolver) stackerSubs(ctx context.Context, object string) map[string]*workerclient.Sub {
	if r.worker == nil {
		return nil
	}
	subs, err := r.worker.Subs(ctx, object)
	if err != nil {
		slog.Warn("Could not load the stacker's subs", "target", object, "error", err)
		return nil
	}
	return indexStackerSubs(subs)
}

// indexStackerSubs keys the stacker's lights by file name. Of a file
// indexed twice, the original wins over the duplicate.
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

// targetSubframes loads a target's subs with the stacker's verdict on each.
func (r *Resolver) targetSubframes(ctx context.Context, targetID int, name string) ([]subframe, error) {
	subs, err := r.loadSubframes(r.db.WithContext(ctx), targetID)
	if err != nil {
		return nil, err
	}
	matchStacker(subs, r.stackerSubs(ctx, name))
	return subs, nil
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
	var acquired *int32
	if s.row.AcquiredDate != nil {
		v := int32(*s.row.AcquiredDate)
		acquired = &v
	}
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
		Sky:              finite(s.sky),
		Hfr:              finite(float64(s.meta.HFR)),
		Fwhm:             finite(float64(s.meta.FWHM)),
		Stars:            stars,
		Eccentricity:     finite(float64(s.meta.Eccentricity)),
		GuidingRmsArcsec: finite(float64(s.meta.GuidingRMSArcSec)),
		Airmass:          finite(float64(s.meta.Airmass)),
		StackStatus:      s.status(),
		StackReason:      s.reason(),
	}
	if s.stack != nil {
		out.Photometry = optional(s.stack.Photometry)
	}
	if s.scored() {
		out.Score = finite(s.stack.Score)
		out.Weight = finite(s.stack.Weight)
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

// summarizeQuality totals a target's subs per filter and exposure. Effective
// hours are the stacker's weights of the subs it stacked, as its masters
// count them.
func summarizeQuality(subs []subframe) []*model.FilterQuality {
	type acc struct {
		out *model.FilterQuality
		sky []float64
		hfr []float64
	}
	groups := map[qualityGroup]*acc{}
	var order []qualityGroup
	for _, s := range subs {
		st := s.status()
		if s.rejectedInScheduler() || st == statusRejected || st == statusDuplicate {
			continue
		}
		g := s.group()
		a, ok := groups[g]
		if !ok {
			a = &acc{out: &model.FilterQuality{FilterName: g.filter, ExposureTime: g.exposure}}
			groups[g] = a
			order = append(order, g)
		}
		a.out.Subframes++
		if !math.IsNaN(g.exposure) {
			a.out.NominalHours += g.exposure / 3600
		}
		switch st {
		case statusPending:
			a.out.Pending++
		case statusAdded:
			a.out.Stacked++
			if w := s.stack.Weight; w > 0 {
				a.out.EffectiveHours += w / 3600
			}
		}
		a.sky = append(a.sky, s.sky)
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
		out = append(out, a.out)
	}
	return out
}

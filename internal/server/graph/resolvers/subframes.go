package resolvers

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/quality"
	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"gorm.io/gorm"
)

// referenceTTL bounds how stale the good-conditions references can get.
// They move slowly, so recomputing them on every request is wasted work.
const referenceTTL = 5 * time.Minute

const (
	gradingPending  = 0
	gradingAccepted = 1
	gradingRejected = 2
)

type qualityGroup struct {
	filter   string
	exposure float64
}

type referenceCache struct {
	mu       sync.Mutex
	loadedAt time.Time
	refs     map[qualityGroup]float64
}

type subframeRow struct {
	ID            int
	AcquiredDate  *int
	FilterName    string
	GradingStatus int
	RejectReason  *string
	Metadata      string
}

type scoredSubframe struct {
	row  subframeRow
	meta quality.Metadata
	sky  float64
	raw  float64
}

func (s scoredSubframe) group() qualityGroup {
	filter := s.meta.FilterName
	if filter == "" {
		filter = s.row.FilterName
	}
	return qualityGroup{filter: filter, exposure: math.Round(float64(s.meta.ExposureDuration))}
}

func (r *Resolver) loadSubframes(db *gorm.DB, where string, args ...any) ([]scoredSubframe, error) {
	var rows []subframeRow
	if err := db.Table("acquiredimage").
		Select(`"Id" as id, acquireddate as acquired_date, filtername as filter_name,
			"gradingStatus" as grading_status, rejectreason as reject_reason, metadata`).
		Where(where, args...).
		Order("acquireddate").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("failed to load subframes: %w", err)
	}

	subs := make([]scoredSubframe, 0, len(rows))
	for _, row := range rows {
		meta, err := quality.ParseMetadata(row.Metadata)
		if err != nil {
			// Keep the sub so counts stay honest; it just scores zero.
			meta = quality.Metadata{ExposureDuration: quality.Float(math.NaN()), HFR: quality.Float(math.NaN()), ADUMedian: quality.Float(math.NaN())}
		}
		sky := quality.Sky(float64(meta.ADUMedian), r.config.Quality.Pedestal)
		subs = append(subs, scoredSubframe{
			row:  row,
			meta: meta,
			sky:  sky,
			raw:  quality.RawWeight(sky, float64(meta.HFR)),
		})
	}
	return subs, nil
}

// references returns the good-conditions weight for every filter and exposure
// group, computed across all targets so a target shot only under the moon
// does not grade itself on a curve.
func (r *Resolver) references(ctx context.Context) (map[qualityGroup]float64, error) {
	r.refs.mu.Lock()
	defer r.refs.mu.Unlock()
	if r.refs.refs != nil && time.Since(r.refs.loadedAt) < referenceTTL {
		return r.refs.refs, nil
	}

	subs, err := r.loadSubframes(r.db.WithContext(ctx), `"gradingStatus" <> ?`, gradingRejected)
	if err != nil {
		return nil, err
	}
	byGroup := map[qualityGroup][]float64{}
	for _, s := range subs {
		byGroup[s.group()] = append(byGroup[s.group()], s.raw)
	}
	refs := make(map[qualityGroup]float64, len(byGroup))
	for g, ws := range byGroup {
		refs[g] = quality.Reference(ws)
	}
	r.refs.refs = refs
	r.refs.loadedAt = time.Now()
	return refs, nil
}

func (r *Resolver) scoredTargetSubframes(ctx context.Context, targetID int) ([]scoredSubframe, map[qualityGroup]float64, error) {
	refs, err := r.references(ctx)
	if err != nil {
		return nil, nil, err
	}
	subs, err := r.loadSubframes(r.db.WithContext(ctx), `"targetId" = ?`, targetID)
	if err != nil {
		return nil, nil, err
	}
	return subs, refs, nil
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

func toModelSubframe(s scoredSubframe, refs map[qualityGroup]float64) *model.Subframe {
	var acquired *int32
	if s.row.AcquiredDate != nil {
		v := int32(*s.row.AcquiredDate)
		acquired = &v
	}
	var fileName *string
	if s.meta.FileName != "" {
		// NINA records Windows paths; the base name is what matches files on disk.
		name := s.meta.FileName[strings.LastIndexAny(s.meta.FileName, `\/`)+1:]
		fileName = &name
	}
	var stars *int32
	if v := float64(s.meta.DetectedStars); !math.IsNaN(v) {
		n := int32(v)
		stars = &n
	}
	score := 0.0
	if s.row.GradingStatus != gradingRejected {
		score = quality.Score(s.raw, refs[s.group()])
	}
	return &model.Subframe{
		ID:               s.row.ID,
		AcquiredDate:     acquired,
		FilterName:       s.group().filter,
		ExposureTime:     finite(float64(s.meta.ExposureDuration)),
		GradingStatus:    gradingStatus(s.row.GradingStatus),
		RejectReason:     s.row.RejectReason,
		FileName:         fileName,
		Sky:              finite(s.sky),
		Hfr:              finite(float64(s.meta.HFR)),
		Fwhm:             finite(float64(s.meta.FWHM)),
		Stars:            stars,
		Eccentricity:     finite(float64(s.meta.Eccentricity)),
		GuidingRmsArcsec: finite(float64(s.meta.GuidingRMSArcSec)),
		Airmass:          finite(float64(s.meta.Airmass)),
		Score:            score,
	}
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

func summarizeQuality(subs []scoredSubframe, refs map[qualityGroup]float64) []*model.FilterQuality {
	type acc struct {
		out  *model.FilterQuality
		sky  []float64
		hfr  []float64
		seen int
	}
	groups := map[qualityGroup]*acc{}
	var order []qualityGroup
	for _, s := range subs {
		if s.row.GradingStatus == gradingRejected {
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
			a.out.EffectiveHours += quality.Score(s.raw, refs[g]) * g.exposure / 3600
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

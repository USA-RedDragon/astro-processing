package resolvers

import (
	"strings"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

func toCalibrationMatch(m workerclient.Match) *model.CalibrationMatch {
	out := &model.CalibrationMatch{
		Quality:          model.CalibrationQuality(strings.ToUpper(m.Quality)),
		AgeDays:          m.AgeDays,
		TempOff:          m.TempOff,
		SetTemp:          m.SetTemp,
		RotationMismatch: m.RotationMismatch,
		Scaled:           m.Scaled,
	}
	if !out.Quality.IsValid() {
		out.Quality = model.CalibrationQualityMissing
	}
	if m.Night != "" {
		night := m.Night
		out.Night = &night
		frames := m.Frames
		out.Frames = &frames
	}
	out.Exposure = m.Exposure
	switch m.Source {
	case "imported":
		src := model.CalibrationSourceImported
		out.Source = &src
		out.Frames = nil
	case "frames":
		src := model.CalibrationSourceFrames
		out.Source = &src
	}
	out.Master = optString(m.Master)
	out.HeaderError = optString(m.HeaderError)
	if b := m.Basis; b != nil {
		out.Basis = &model.CalibrationBasis{
			Night: optString(b.Night), Exposure: optString(b.Exposure), Gain: optString(b.Gain),
			Offset: optString(b.Offset), SetTemp: optString(b.SetTemp), BinX: optString(b.BinX),
		}
	}
	return out
}

func optString(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func toDarkLibrary(rep workerclient.DarkGapReport) *model.DarkLibrary {
	out := &model.DarkLibrary{
		Ladder:           rep.Ladder,
		MinFrames:        rep.MinFrames,
		SetTempExactC:    rep.SetTempExactC,
		SetTempScaleMaxC: rep.SetTempScaleMaxC,
		Gaps:             make([]*model.DarkLibraryGap, 0, len(rep.Gaps)),
	}
	if out.Ladder == nil {
		out.Ladder = []float64{}
	}
	for _, g := range rep.Gaps {
		other := g.OtherExposures
		if other == nil {
			other = []float64{}
		}
		out.Gaps = append(out.Gaps, &model.DarkLibraryGap{
			Gain: g.Gain, Offset: g.Offset, Exposure: g.Exposure, SetTemp: g.SetTemp,
			Lights: g.Lights, Nights: g.Nights, LatestNight: g.LatestNight, OtherExposures: other,
		})
	}
	return out
}

func toCalibrationRow(r workerclient.Row) *model.CalibrationRow {
	return &model.CalibrationRow{
		Night:    r.Night,
		Filter:   r.Filter,
		Exposure: r.Exposure,
		Gain:     r.Gain,
		Offset:   r.Offset,
		SetTemp:  r.SetTemp,
		Rotator:  r.Rotator,
		Lights:   r.Lights,
		Flat:     toCalibrationMatch(r.Flat),
		Dark:     toCalibrationMatch(r.Dark),
		Bias:     toCalibrationMatch(r.Bias),
	}
}

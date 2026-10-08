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

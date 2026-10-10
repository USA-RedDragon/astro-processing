package resolvers

import (
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/workerclient"
)

const handEntered = "hand-entered"

func TestCalibrationMatchImported(t *testing.T) {
	t.Parallel()
	exp := 600.0
	m := toCalibrationMatch(workerclient.Match{
		Quality: "fallback", Night: "2025-01-21", Exposure: &exp, Source: "imported", Master: "offset240/masters/d.xisf",
		Basis: &workerclient.Basis{Night: handEntered, Exposure: "file name", Gain: handEntered, Offset: "folder name", SetTemp: "header"},
	})
	if m.Source == nil || *m.Source != model.CalibrationSourceImported || m.Frames != nil || *m.Master != "offset240/masters/d.xisf" ||
		*m.Exposure != 600 || m.HeaderError != nil {
		t.Errorf("match %+v", m)
	}
	if m.Basis == nil || *m.Basis.Gain != handEntered || *m.Basis.SetTemp != "header" || m.Basis.BinX != nil {
		t.Errorf("basis %+v", m.Basis)
	}
	built := toCalibrationMatch(workerclient.Match{Quality: "exact", Night: "2025-01-21", Frames: 20, Source: "frames"})
	if built.Source == nil || *built.Source != model.CalibrationSourceFrames || *built.Frames != 20 || built.Basis != nil {
		t.Errorf("built %+v", built)
	}
}

func TestDarkLibrary(t *testing.T) {
	t.Parallel()
	n := int32(3)
	lib := toDarkLibrary(workerclient.DarkGapReport{Ladder: []float64{-25, -15}, MinFrames: &n,
		Gaps: []workerclient.DarkGap{{SetTemp: -15, Lights: 4}}})
	if len(lib.Ladder) != 2 || *lib.MinFrames != 3 || len(lib.Gaps) != 1 || lib.Gaps[0].OtherExposures == nil {
		t.Errorf("library %+v", lib)
	}
	old := toDarkLibrary(workerclient.DarkGapReport{})
	if old.Ladder == nil || old.MinFrames != nil || len(old.Gaps) != 0 {
		t.Errorf("old %+v", old)
	}
}

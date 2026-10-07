package submeta_test

import (
	"math"
	"testing"

	"github.com/USA-RedDragon/astro-processing/internal/submeta"
)

func TestParseMetadataHandlesNaNStrings(t *testing.T) {
	t.Parallel()
	m, err := submeta.ParseMetadata(`{"FileName":"A:\\NINA\\M31\\LIGHT\\x.xisf","FilterName":"Red",` +
		`"ExposureDuration":600.0,"DetectedStars":349,"HFR":1.57,"FWHM":"NaN","ADUMedian":620.0,"Offset":50}`)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !math.IsNaN(float64(m.FWHM)) {
		t.Errorf("FWHM = %v, want NaN", m.FWHM)
	}
	if m.HFR != 1.57 || m.ADUMedian != 620 || m.ExposureDuration != 600 || m.FilterName != "Red" || m.Offset != 50 {
		t.Errorf("unexpected metadata: %+v", m)
	}
}

func TestParseMetadataRejectsGarbage(t *testing.T) {
	t.Parallel()
	if _, err := submeta.ParseMetadata(`not json`); err == nil {
		t.Error("expected an error")
	}
}

func TestSky(t *testing.T) {
	t.Parallel()
	if got := submeta.Sky(620, 506); got != 114 {
		t.Errorf("Sky = %v, want 114", got)
	}
	if got := submeta.Sky(500, 506); !math.IsNaN(got) {
		t.Errorf("Sky below pedestal = %v, want NaN", got)
	}
}

func TestPedestalAt(t *testing.T) {
	t.Parallel()
	for _, c := range []struct{ offset, want float64 }{
		{50, 506}, {0, 506}, {math.NaN(), 506}, {240, 2406},
	} {
		if got := submeta.PedestalAt(506, c.offset); got != c.want {
			t.Errorf("PedestalAt(506, %v) = %v, want %v", c.offset, got, c.want)
		}
	}
}

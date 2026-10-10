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

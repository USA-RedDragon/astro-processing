// Package submeta reads the metadata Target Scheduler records for every
// acquired image, for showing a sub's conditions. Subs are scored by
// astro-stacker, not here.
package submeta

import (
	"encoding/json"
	"math"
	"strconv"
)

// pedestalOffset is the camera offset the configured pedestal is measured
// at, and pedestalPerOffset the ADU each unit of offset adds, as
// astro-stacker's quality.PedestalAt has them: the ASI2600MM's offset-240
// master bias sits at 2403 ADU, 1897 above offset 50's.
const (
	pedestalOffset    = 50
	pedestalPerOffset = 10.0
)

// Float decodes a JSON number or a string such as "NaN", which is how
// Target Scheduler writes metrics it could not measure.
type Float float64

func (f *Float) UnmarshalJSON(b []byte) error {
	if len(b) > 0 && b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		v, err := strconv.ParseFloat(s, 64)
		if err != nil {
			*f = Float(math.NaN())
			return nil //nolint:nilerr // unparseable metrics count as missing
		}
		*f = Float(v)
		return nil
	}
	var v float64
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	*f = Float(v)
	return nil
}

// Metadata is the subset of acquiredimage.metadata shown for a sub.
type Metadata struct {
	FileName          string `json:"FileName"`
	FilterName        string `json:"FilterName"`
	ExposureStartTime string `json:"ExposureStartTime"`
	ExposureDuration  Float  `json:"ExposureDuration"`
	DetectedStars     Float  `json:"DetectedStars"`
	HFR               Float  `json:"HFR"`
	FWHM              Float  `json:"FWHM"`
	Eccentricity      Float  `json:"Eccentricity"`
	ADUMedian         Float  `json:"ADUMedian"`
	Offset            Float  `json:"Offset"`
	GuidingRMSArcSec  Float  `json:"GuidingRMSArcSec"`
	Airmass           Float  `json:"Airmass"`
}

// ParseMetadata decodes a Target Scheduler metadata blob.
func ParseMetadata(raw string) (Metadata, error) {
	var m Metadata
	err := json.Unmarshal([]byte(raw), &m)
	return m, err
}

// PedestalAt is the pedestal at a camera offset, from the pedestal at offset
// 50. An unknown offset (0 or NaN) is taken as 50.
func PedestalAt(pedestal, offset float64) float64 {
	if !(offset > 0) {
		return pedestal
	}
	return pedestal + (offset-pedestalOffset)*pedestalPerOffset
}

// Sky returns the background above the pedestal, or NaN if it is not positive.
func Sky(aduMedian, pedestal float64) float64 {
	s := aduMedian - pedestal
	if !(s > 0) {
		return math.NaN()
	}
	return s
}

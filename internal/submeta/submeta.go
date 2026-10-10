// Package submeta reads the metadata Target Scheduler records for every
// acquired image, for showing a sub's conditions. Subs are scored by
// astro-stacker, not here.
package submeta

import (
	"encoding/json"
	"math"
	"strconv"
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

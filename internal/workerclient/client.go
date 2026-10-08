// Package workerclient reads calibration coverage from pixinsight-worker,
// which indexes every frame in the object store.
package workerclient

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/USA-RedDragon/astro-processing/internal/metrics"
)

type Match struct {
	Quality          string   `json:"quality"`
	Night            string   `json:"night"`
	Frames           int32    `json:"frames"`
	AgeDays          int32    `json:"age_days"`
	TempOff          *float64 `json:"temp_off"`
	SetTemp          *float64 `json:"set_temp"`
	RotationMismatch bool     `json:"rotation_mismatch"`
	Scaled           bool     `json:"scaled"`
}

type Row struct {
	Night    string   `json:"night"`
	Object   string   `json:"object"`
	Filter   string   `json:"filter"`
	Exposure float64  `json:"exposure"`
	Gain     *float64 `json:"gain"`
	Offset   *float64 `json:"offset"`
	SetTemp  *float64 `json:"set_temp"`
	Rotator  *float64 `json:"rotator"`
	Lights   int32    `json:"lights"`
	Flat     Match    `json:"flat"`
	Dark     Match    `json:"dark"`
	Bias     Match    `json:"bias"`
}

type DarkGap struct {
	Gain        *float64 `json:"gain"`
	Offset      *float64 `json:"offset"`
	SetTemp     float64  `json:"set_temp"`
	Lights      int32    `json:"lights"`
	Nights      int32    `json:"nights"`
	LatestNight string   `json:"latest_night"`
}

type Preview struct {
	File string `json:"file"`
	URL  string `json:"url"`
}

// Crop is the well-covered part of an image as fractions of its size.
type Crop struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type Master struct {
	Filter           string    `json:"filter"`
	Subs             int32     `json:"subs"`
	ExposureSeconds  float64   `json:"exposure_seconds"`
	EffectiveSeconds float64   `json:"effective_seconds"`
	Width            int32     `json:"width"`
	Height           int32     `json:"height"`
	UpdatedAt        time.Time `json:"updated_at"`
	MasterURL        string    `json:"master_url"`
	PreviewURL       string    `json:"preview_url"`
	LinearURL        string    `json:"linear_url"`
	Crop             *Crop     `json:"crop"`
	XISFURL          string    `json:"xisf_url"`
	FittedURL        string    `json:"fitted_url"`
	FitReference     string    `json:"fit_reference"`
	CometPreviewURL  string    `json:"comet_preview_url"`
	CometURL         string    `json:"comet_url"`
	CometXISFURL     string    `json:"comet_xisf_url"`
}

type Client struct {
	base string
	http *http.Client
}

// New returns nil when baseURL is empty, meaning the worker isn't configured.
func New(baseURL string) *Client {
	if baseURL == "" {
		return nil
	}
	return &Client{
		base: strings.TrimRight(baseURL, "/"),
		http: &http.Client{Timeout: 10 * time.Second},
	}
}

// Coverage returns calibration coverage for one target's lights. Target
// names match the OBJECT header NINA writes from the scheduler target.
func (c *Client) Coverage(ctx context.Context, object string) ([]Row, error) {
	var rows []Row
	err := c.get(ctx, "/api/v1/coverage?object="+url.QueryEscape(object), &rows)
	return rows, err
}

// Previews returns presigned preview URLs for a target's lights, keyed by
// file name.
func (c *Client) Previews(ctx context.Context, object string) (map[string]string, error) {
	var list []Preview
	if err := c.get(ctx, "/api/v1/previews?object="+url.QueryEscape(object), &list); err != nil {
		return nil, err
	}
	out := make(map[string]string, len(list))
	for _, p := range list {
		out[p.File] = p.URL
	}
	return out, nil
}

// Masters returns a target's stacked masters, one per filter.
func (c *Client) Masters(ctx context.Context, object string) ([]Master, error) {
	var masters []Master
	err := c.get(ctx, "/api/v1/stacks?object="+url.QueryEscape(object), &masters)
	return masters, err
}

// Sub is what the stacker made of one light, matched to Target Scheduler's
// acquired images by file name. Status is empty for a light the stacker
// hasn't processed yet.
type Sub struct {
	File        string     `json:"file"`
	Filter      string     `json:"filter"`
	Exposure    *float64   `json:"exposure"`
	Status      string     `json:"status"`
	Score       float64    `json:"score"`
	Weight      float64    `json:"weight"`
	Error       string     `json:"error"`
	ProcessedAt *time.Time `json:"processed_at"`
	// Photometry is pending, measured or failed: whether the stacker's own
	// star photometry is in the sub's transparency yet.
	Photometry string `json:"photometry"`
}

// Subs returns one target's lights with the stacker's status, score and
// weight for each.
func (c *Client) Subs(ctx context.Context, object string) ([]Sub, error) {
	var subs []Sub
	err := c.get(ctx, "/api/v1/subs?object="+url.QueryEscape(object), &subs)
	return subs, err
}

type Mosaic struct {
	Filter      string    `json:"filter"`
	Panels      int32     `json:"panels"`
	PanelsTotal int32     `json:"panels_total"`
	Width       int32     `json:"width"`
	Height      int32     `json:"height"`
	UpdatedAt   time.Time `json:"updated_at"`
	MasterURL   string    `json:"master_url"`
	PreviewURL  string    `json:"preview_url"`
	LinearURL   string    `json:"linear_url"`
	Crop        *Crop     `json:"crop"`
}

func (c *Client) Mosaics(ctx context.Context, project string) ([]Mosaic, error) {
	var mosaics []Mosaic
	err := c.get(ctx, "/api/v1/mosaics?project="+url.QueryEscape(project), &mosaics)
	return mosaics, err
}

type Cover struct {
	Palette          string    `json:"palette"` // set for a colour composite
	Filter           string    `json:"filter"`
	PreviewURL       string    `json:"preview_url"`
	EffectiveSeconds float64   `json:"effective_seconds"`
	UpdatedAt        time.Time `json:"updated_at"`
}

// Covers holds the best preview per target (by object name) and per mosaic
// project.
type Covers struct {
	Objects map[string]Cover `json:"objects"`
	Mosaics map[string]Cover `json:"mosaics"`
}

func (c *Client) Covers(ctx context.Context) (*Covers, error) {
	var covers Covers
	err := c.get(ctx, "/api/v1/covers", &covers)
	return &covers, err
}

// Object is a target with lights, as the worker's files know it.
type Object struct {
	Name       string  `json:"name"`
	Lights     int32   `json:"lights"`
	Stacked    int32   `json:"stacked"`
	Nights     int32   `json:"nights"`
	FirstNight *string `json:"first_night"`
	LastNight  *string `json:"last_night"`
	Scheduled  bool    `json:"scheduled"`
}

func (c *Client) Objects(ctx context.Context) ([]Object, error) {
	var objects []Object
	err := c.get(ctx, "/api/v1/objects", &objects)
	return objects, err
}

func (c *Client) DarkGaps(ctx context.Context) ([]DarkGap, error) {
	var gaps []DarkGap
	err := c.get(ctx, "/api/v1/coverage/dark-gaps", &gaps)
	return gaps, err
}

func (c *Client) get(ctx context.Context, path string, out any) (err error) {
	start := time.Now()
	defer func() {
		endpoint, _, _ := strings.Cut(path, "?")
		metrics.WorkerRequestSeconds.WithLabelValues(endpoint, map[bool]string{true: "ok", false: "error"}[err == nil]).
			Observe(time.Since(start).Seconds())
	}()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("pixinsight-worker: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("pixinsight-worker: %s returned %s", path, resp.Status)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("pixinsight-worker: decode %s: %w", path, err)
	}
	return nil
}

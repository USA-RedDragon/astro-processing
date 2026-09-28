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
)

type Match struct {
	Quality          string   `json:"quality"`
	Night            string   `json:"night"`
	Frames           int      `json:"frames"`
	AgeDays          int      `json:"age_days"`
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
	Lights   int      `json:"lights"`
	Flat     Match    `json:"flat"`
	Dark     Match    `json:"dark"`
	Bias     Match    `json:"bias"`
}

type DarkGap struct {
	Gain        *float64 `json:"gain"`
	Offset      *float64 `json:"offset"`
	SetTemp     float64  `json:"set_temp"`
	Lights      int      `json:"lights"`
	Nights      int      `json:"nights"`
	LatestNight string   `json:"latest_night"`
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

func (c *Client) DarkGaps(ctx context.Context) ([]DarkGap, error) {
	var gaps []DarkGap
	err := c.get(ctx, "/api/v1/coverage/dark-gaps", &gaps)
	return gaps, err
}

func (c *Client) get(ctx context.Context, path string, out any) error {
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

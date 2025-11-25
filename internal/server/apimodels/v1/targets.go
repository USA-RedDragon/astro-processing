package v1

import (
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
)

type CleanedTarget struct {
	targetscheduler.Target
	Active bool `json:"active"`
}

type TargetImageStatsResponse struct {
	LastImageDate int                         `json:"last_image_date"`
	Total         TargetImageStats            `json:"total"`
	Filters       map[string]TargetImageStats `json:"filters"`
}

type TargetImageStats struct {
	DesiredImages  int `json:"desired_images"`
	AcceptedImages int `json:"accepted_images"`
	RejectedImages int `json:"rejected_images"`
	AcquiredImages int `json:"acquired_images"`
}

type ListTargetsResponse struct {
	Targets []CleanedTarget `json:"targets"`
}

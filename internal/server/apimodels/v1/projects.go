package v1

import (
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
)

type ListProjectsResponse struct {
	Projects []targetscheduler.Project `json:"projects"`
}

type ListProjectTargetsResponse struct {
	Targets []targetscheduler.Target `json:"targets"`
}

type ProjectStatsResponse struct {
	LastImageDate int `json:"last_image_date"`
	TargetImageStats
}

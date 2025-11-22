package v1

import (
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
)

type ListTargetsResponse struct {
	Targets []targetscheduler.Target `json:"targets"`
}

package targetscheduler

import (
	"encoding/json"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
)

func getProjectState(state ProjectState) model.ProjectState {
	switch state {
	case ProjectStateActive:
		return model.ProjectStateActive
	case ProjectStateInactive:
		return model.ProjectStateInactive
	case ProjectStateClosed:
		return model.ProjectStateClosed
	}
	return model.ProjectStateDraft
}

func getProjectPriority(priority ProjectPriority) model.ProjectPriority {
	switch priority {
	case ProjectPriorityLow:
		return model.ProjectPriorityLow
	case ProjectPriorityHigh:
		return model.ProjectPriorityHigh
	}
	return model.ProjectPriorityNormal
}

type ProjectState int

const (
	ProjectStateDraft    ProjectState = 0
	ProjectStateActive   ProjectState = 1
	ProjectStateInactive ProjectState = 2
	ProjectStateClosed   ProjectState = 3
)

func (ps ProjectState) String() string {
	switch ps {
	case ProjectStateDraft:
		return "Draft"
	case ProjectStateActive:
		return "Active"
	case ProjectStateInactive:
		return "Inactive"
	case ProjectStateClosed:
		return "Closed"
	}
	return "Unknown"
}

func (e ProjectState) MarshalJSON() ([]byte, error) {
	return json.Marshal(e.String())
}

type ProjectPriority int

const (
	ProjectPriorityLow    ProjectPriority = 0
	ProjectPriorityNormal ProjectPriority = 1
	ProjectPriorityHigh   ProjectPriority = 2
)

func (pp ProjectPriority) String() string {
	switch pp {
	case ProjectPriorityLow:
		return "Low"
	case ProjectPriorityNormal:
		return "Normal"
	case ProjectPriorityHigh:
		return "High"
	}
	return "Unknown"
}

func (e ProjectPriority) MarshalJSON() ([]byte, error) {
	return json.Marshal(e.String())
}

type Project struct {
	ID                    int              `json:"id" gorm:"column:Id;primaryKey"`
	ProfileID             string           `json:"profile_id" gorm:"column:profileId;size:255;not null"`
	Name                  string           `json:"name" gorm:"column:name;size:255;not null"`
	Description           *string          `json:"description" gorm:"column:description;size:255"`
	State                 *ProjectState    `json:"state" gorm:"column:state"`
	Priority              *ProjectPriority `json:"priority" gorm:"column:priority"`
	CreateDate            *int             `json:"create_date" gorm:"column:createdate"`
	ActiveDate            *int             `json:"active_date" gorm:"column:activedate"`
	InactiveDate          *int             `json:"inactive_date" gorm:"column:inactivedate"`
	MinimumTime           *int             `json:"minimum_time" gorm:"column:minimumtime"`
	MinimumAltitude       *float64         `json:"minimum_altitude" gorm:"column:minimumaltitude"`
	UseCustomHorizon      *int             `json:"use_custom_horizon" gorm:"column:usecustomhorizon"`
	HorizonOffset         *float64         `json:"horizon_offset" gorm:"column:horizonoffset"`
	MeridianWindow        *int             `json:"meridian_window" gorm:"column:meridianwindow"`
	FilterSwitchFrequency *int             `json:"filter_switch_frequency" gorm:"column:filterswitchfrequency"`
	DitherEvery           *int             `json:"dither_every" gorm:"column: ditherevery"`
	EnableGrader          *int             `json:"enable_grader" gorm:"column:enablegrader"`
	IsMosaic              bool             `json:"is_mosaic" gorm:"column:isMosaic;not null"`
	FlatsHandling         int              `json:"flats_handling" gorm:"column:flatsHandling;not null"`
	MaximumAltitude       *float64         `json:"maximum_altitude" gorm:"column:maximumAltitude"`
	SmartExposureOrder    *int             `json:"smart_exposure_order" gorm:"column:smartexposureorder"`
	GUID                  *string          `json:"-" gorm:"column:guid;size:255"`
}

func (Project) TableName() string {
	return "project"
}

func (p *Project) GraphQL() *model.Project {
	gql := &model.Project{
		ID:          p.ID,
		ProfileID:   p.ProfileID,
		Name:        p.Name,
		Description: p.Description,
	}

	if p.State != nil {
		state := getProjectState(*p.State)
		gql.State = &state
	}

	if p.Priority != nil {
		priority := getProjectPriority(*p.Priority)
		gql.Priority = &priority
	}

	if p.CreateDate != nil {
		val := int32(*p.CreateDate)
		gql.CreateDate = &val
	}
	if p.ActiveDate != nil {
		val := int32(*p.ActiveDate)
		gql.ActiveDate = &val
	}
	if p.InactiveDate != nil {
		val := int32(*p.InactiveDate)
		gql.InactiveDate = &val
	}
	if p.MinimumTime != nil {
		val := int32(*p.MinimumTime)
		gql.MinimumTime = &val
	}

	gql.MinimumAltitude = p.MinimumAltitude

	if p.UseCustomHorizon != nil {
		val := *p.UseCustomHorizon != 0
		gql.UseCustomHorizon = &val
	}

	gql.HorizonOffset = p.HorizonOffset

	if p.MeridianWindow != nil {
		val := int32(*p.MeridianWindow)
		gql.MeridianWindow = &val
	}
	if p.FilterSwitchFrequency != nil {
		val := int32(*p.FilterSwitchFrequency)
		gql.FilterSwitchFrequency = &val
	}
	if p.DitherEvery != nil {
		val := int32(*p.DitherEvery)
		gql.DitherEvery = &val
	}

	if p.EnableGrader != nil {
		val := *p.EnableGrader != 0
		gql.EnableGrader = &val
	}

	gql.IsMosaic = &p.IsMosaic

	val := int32(p.FlatsHandling)
	gql.FlatsHandling = &val

	gql.MaximumAltitude = p.MaximumAltitude

	if p.SmartExposureOrder != nil {
		val := int32(*p.SmartExposureOrder)
		gql.SmartExposureOrder = &val
	}

	return gql
}

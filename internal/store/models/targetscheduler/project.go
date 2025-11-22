package targetscheduler

type ProjectState int
type ProjectPriority int

type Project struct {
	ID                    int              `json:"-" gorm:"column:Id;primaryKey"`
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
	GUID                  *string          `json:"guid" gorm:"column:guid;size:255"`
}

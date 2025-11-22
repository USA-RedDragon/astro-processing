package targetscheduler

type ExposureTemplate struct {
	ID                      int      `json:"-" gorm:"column:Id;primaryKey"`
	ProfileID               string   `json:"profile_id" gorm:"column:profileId;size:255;not null"`
	Name                    string   `json:"name" gorm:"column:name;size:255;not null"`
	FilterName              string   `json:"filter_name" gorm:"column:filtername;size:255;not null"`
	Gain                    *int     `json:"gain" gorm:"column:gain"`
	Offset                  *int     `json:"offset" gorm:"column:offset"`
	Bin                     *int     `json:"bin" gorm:"column:bin"`
	ReadoutMode             *int     `json:"readout_mode" gorm:"column:readoutmode"`
	TwilightLevel           *int     `json:"twilight_level" gorm:"column:twilightlevel"`
	MoonAvoidanceEnabled    *int     `json:"moon_avoidance_enabled" gorm:"column:moonavoidanceenabled"`
	MoonAvoidanceSeparation *float64 `json:"moon_avoidance_separation" gorm:"column:moonavoidanceseparation"`
	MoonAvoidanceWidth      *int     `json:"moon_avoidance_width" gorm:"column:moonavoidancewidth"`
	MaximumHumidity         *float64 `json:"maximum_humidity" gorm:"column:maximumhumidity"`
	DefaultExposure         *float64 `json:"default_exposure" gorm:"column:defaultexposure"`
	MoonRelaxScale          *float64 `json:"moon_relax_scale" gorm:"column:moonrelaxscale"`
	MoonRelaxMaxAltitude    *float64 `json:"moon_relax_max_altitude" gorm:"column:moonrelaxmaxaltitude"`
	MoonRelaxMinAltitude    *float64 `json:"moon_relax_min_altitude" gorm:"column:moonrelaxminaltitude"`
	MoonDownEnabled         *int     `json:"moon_down_enabled" gorm:"column:moondownenabled"`
	DitherEvery             *int     `json:"dither_every" gorm:"column:ditherevery"`
	MinutesOffset           *int     `json:"minutes_offset" gorm:"column:minutesOffset"`
	GUID                    *string  `json:"guid" gorm:"column:guid;size:255"`
}

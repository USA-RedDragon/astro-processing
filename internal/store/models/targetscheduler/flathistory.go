package targetscheduler

type FlatHistory struct {
	ID               int      `json:"id" gorm:"column:Id;primaryKey"`
	TargetID         *int     `json:"target_id" gorm:"column:targetId"`
	LightSessionDate *int     `json:"light_session_date" gorm:"column:lightSessionDate"`
	FlatsTakenDate   *int     `json:"flats_taken_date" gorm:"column:flatsTakenDate"`
	ProfileID        string   `json:"profile_id" gorm:"column:profileId;size:255;not null"`
	FlatsType        *string  `json:"flats_type" gorm:"column:flatsType;size:255"`
	FilterName       *string  `json:"filter_name" gorm:"column:filterName;size:255"`
	Gain             *int     `json:"gain" gorm:"column:gain"`
	Offset           *int     `json:"offset" gorm:"column:offset"`
	Bin              *int     `json:"bin" gorm:"column:bin"`
	ReadoutMode      *int     `json:"readout_mode" gorm:"column:readoutmode"`
	Rotation         *float64 `json:"rotation" gorm:"column:rotation"`
	ROI              *float64 `json:"roi" gorm:"column:roi"`
	LightSessionID   int      `json:"light_session_id" gorm:"column:lightSessionId;not null"`
}

func (FlatHistory) TableName() string {
	return "flathistory"
}

package targetscheduler

type ExposurePlan struct {
	ID                 int     `json:"-" gorm:"column:Id;primaryKey"`
	ProfileID          string  `json:"profile_id" gorm:"column:profileId;size:255;not null"`
	Exposure           float64 `json:"exposure" gorm:"column:exposure;not null"`
	Desired            *int    `json:"desired" gorm:"column:desired"`
	Acquired           *int    `json:"acquired" gorm:"column:acquired"`
	Accepted           *int    `json:"accepted" gorm:"column:accepted"`
	TargetID           *int    `json:"target_id" gorm:"column:targetid"`
	ExposureTemplateID *int    `json:"exposure_template_id" gorm:"column:exposureTemplateId"`
	Enabled            *int    `json:"enabled" gorm:"column:enabled"`
	GUID               *string `json:"guid" gorm:"column:guid;size:255"`
}

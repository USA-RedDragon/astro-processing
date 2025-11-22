package targetscheduler

type AcquiredImage struct {
	ID            int     `json:"id" gorm:"column:Id;primaryKey"`
	ProjectID     int     `json:"project_id" gorm:"column:projectId;not null"`
	Project       Project `json:"project" gorm:"foreignKey:ProjectID;references:ID"`
	TargetID      int     `json:"target_id" gorm:"column:targetId;not null"`
	Target        Target  `json:"target" gorm:"foreignKey:TargetID;references:ID"`
	AcquiredDate  *int    `json:"acquired_date" gorm:"column:acquireddate"`
	FilterName    string  `json:"filter_name" gorm:"column:filtername;size:255;not null"`
	GradingStatus int     `json:"grading_status" gorm:"column:gradingStatus;not null"`
	Metadata      string  `json:"metadata" gorm:"column:metadata;type:text;not null"`
	RejectReason  *string `json:"reject_reason" gorm:"column:rejectreason;size:255"`
	ProfileID     *string `json:"profile_id" gorm:"column:profileId;size:255"`
	ExposureID    *int    `json:"exposure_id" gorm:"column:exposureId"`
	GUID          *string `json:"-" gorm:"column:guid;size:255"`
}

func (AcquiredImage) TableName() string {
	return "acquiredimage"
}

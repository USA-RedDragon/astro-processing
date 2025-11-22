package targetscheduler

type OverrideExposureOrderItem struct {
	ID           int  `json:"-" gorm:"column:Id;primaryKey"`
	TargetID     int  `json:"target_id" gorm:"column:targetid;not null"`
	Order        int  `json:"order" gorm:"column:order;not null"`
	Action       int  `json:"action" gorm:"column:action;not null"`
	ReferenceIdx *int `json:"reference_idx" gorm:"column:referenceIdx"`
}

func (OverrideExposureOrderItem) TableName() string {
	return "overrideexposureorderitem"
}

package targetscheduler

type FilterCadenceItem struct {
	ID           int  `json:"-" gorm:"column:Id;primaryKey"`
	TargetID     int  `json:"target_id" gorm:"column:targetid;not null"`
	Order        int  `json:"order" gorm:"column:order;not null"`
	Next         *int `json:"next" gorm:"column:next"`
	Action       int  `json:"action" gorm:"column:action;not null"`
	ReferenceIdx *int `json:"reference_idx" gorm:"column:referenceIdx"`
}

func (FilterCadenceItem) TableName() string {
	return "filtercadenceitem"
}

package targetscheduler

type RuleWeight struct {
	ID        int     `json:"-" gorm:"column:Id;primaryKey"`
	Name      string  `json:"name" gorm:"column:name;size:255;not null"`
	Weight    float64 `json:"weight" gorm:"column:weight;not null"`
	ProjectID *int    `json:"project_id" gorm:"column:projectid"`
}

func (RuleWeight) TableName() string {
	return "ruleweight"
}

package targetscheduler

type ImageData struct {
	ID              int     `json:"-" gorm:"column:Id;primaryKey"`
	Tag             *string `json:"tag" gorm:"column:tag;size:255"`
	AcquiredImageID *int    `json:"acquired_image_id" gorm:"column:acquiredimageid"`
	Width           *int    `json:"width" gorm:"column:width"`
	Height          *int    `json:"height" gorm:"column:height"`
}

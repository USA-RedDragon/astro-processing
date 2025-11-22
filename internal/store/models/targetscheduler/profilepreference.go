package targetscheduler

type ProfilePreference struct {
	ID                                   int      `json:"-" gorm:"column:Id;primaryKey"`
	ProfileID                            string   `json:"profile_id" gorm:"column:profileId;size:255;not null"`
	EnableGradeRMS                       *int     `json:"enable_grade_rms" gorm:"column:enableGradeRMS"`
	EnableGradeStars                     *int     `json:"enable_grade_stars" gorm:"column:enableGradeStars"`
	EnableGradeHFR                       *int     `json:"enable_grade_hfr" gorm:"column:enableGradeHFR"`
	MaxGradingSampleSize                 *int     `json:"max_grading_sample_size" gorm:"column:maxGradingSampleSize"`
	RMSPixelThreshold                    *float64 `json:"rms_pixel_threshold" gorm:"column:rmsPixelThreshold"`
	DetectedStarsSigmaFactor             *float64 `json:"detected_stars_sigma_factor" gorm:"column:detectedStarsSigmaFactor"`
	HFRSigmaFactor                       *float64 `json:"hfr_sigma_factor" gorm:"column:hfrSigmaFactor"`
	AcceptImprovement                    *int     `json:"accept_improvement" gorm:"column:acceptimprovement"`
	ExposureThrottle                     *float64 `json:"exposure_throttle" gorm:"column:exposurethrottle"`
	ParkOnWait                           *int     `json:"park_on_wait" gorm:"column:parkonwait"`
	EnableSmartPlanWindow                *int     `json:"enable_smart_plan_window" gorm:"column:enableSmartPlanWindow"`
	EnableSynchronization                *int     `json:"enable_synchronization" gorm:"column:enableSynchronization"`
	SyncWaitTimeout                      *int     `json:"sync_wait_timeout" gorm:"column:syncWaitTimeout"`
	SyncActionTimeout                    *int     `json:"sync_action_timeout" gorm:"column:syncActionTimeout"`
	SyncSolveRotateTimeout               *int     `json:"sync_solve_rotate_timeout" gorm:"column:syncSolveRotateTimeout"`
	EnableMoveRejected                   *int     `json:"enable_move_rejected" gorm:"column:enableMoveRejected"`
	EnableGradeFWHM                      *int     `json:"enable_grade_fwhm" gorm:"column:enableGradeFWHM"`
	EnableGradeEccentricity              *int     `json:"enable_grade_eccentricity" gorm:"column:enableGradeEccentricity"`
	FWHMSigmaFactor                      *int     `json:"fwhm_sigma_factor" gorm:"column:fwhmSigmaFactor"`
	EccentricitySigmaFactor              *int     `json:"eccentricity_sigma_factor" gorm:"column:eccentricitySigmaFactor"`
	EnableDeleteAcquiredImagesWithTarget *int     `json:"enable_delete_acquired_images_with_target" gorm:"column:enableDeleteAcquiredImagesWithTarget"`
	SyncEventContainerTimeout            *int     `json:"sync_event_container_timeout" gorm:"column:syncEventContainerTimeout"`
	DelayGrading                         *float64 `json:"delay_grading" gorm:"column:delayGrading"`
	AutoAcceptLevelHFR                   *float64 `json:"auto_accept_level_hfr" gorm:"column:autoAcceptLevelHFR"`
	AutoAcceptLevelFWHM                  *float64 `json:"auto_accept_level_fwhm" gorm:"column:autoAcceptLevelFWHM"`
	AutoAcceptLevelEccentricity          *float64 `json:"auto_accept_level_eccentricity" gorm:"column:autoAcceptLevelEccentricity"`
	EnableSimulatedRun                   *int     `json:"enable_simulated_run" gorm:"column:enableSimulatedRun"`
	SkipSimulatedWaits                   *int     `json:"skip_simulated_waits" gorm:"column:skipSimulatedWaits"`
	SkipSimulatedUpdates                 *int     `json:"skip_simulated_updates" gorm:"column:skipSimulatedUpdates"`
	EnableSlewCenter                     *int     `json:"enable_slew_center" gorm:"column:enableSlewCenter"`
	LogLevel                             *int     `json:"log_level" gorm:"column:logLevel"`
	EnableStopOnHumidity                 *int     `json:"enable_stop_on_humidity" gorm:"column:enableStopOnHumidity"`
	GUID                                 *string  `json:"guid" gorm:"column:guid;size:255"`
	EnableProfileTargetCompletionReset   *int     `json:"enable_profile_target_completion_reset" gorm:"column:enableProfileTargetCompletionReset"`
}

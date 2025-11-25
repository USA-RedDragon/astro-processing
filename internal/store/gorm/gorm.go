package gorm

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	v1 "github.com/USA-RedDragon/astro-processing/internal/server/apimodels/v1"
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/USA-RedDragon/astro-processing/internal/types"
	"github.com/glebarez/sqlite"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type Gorm struct {
	db *gorm.DB
}

func NewGormStore(cfg *config.Config) (*Gorm, error) {
	var dialect gorm.Dialector
	switch cfg.Storage.Type {
	case types.StorageTypeSQLite:
		dialect = sqlite.Open(cfg.Storage.DSN)
	case types.StorageTypePostgres:
		dialect = postgres.Open(cfg.Storage.DSN)
	case types.StorageTypeMySQL:
		dialect = mysql.Open(cfg.Storage.DSN)
	default:
		return nil, config.ErrInvalidStorageType
	}

	db, err := gorm.Open(dialect, &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return &Gorm{
		db: db,
	}, nil
}

func (g *Gorm) WithContext(ctx context.Context) *Gorm {
	return &Gorm{
		db: g.db.WithContext(ctx),
	}
}

func (g *Gorm) ListTargets() ([]targetscheduler.Target, error) {
	var targets []targetscheduler.Target
	if err := g.db.
		Select("target.*").
		Joins("LEFT JOIN acquiredimage ON acquiredimage.\"targetId\" = target.\"Id\"").
		Group("target.\"Id\"").
		Order("MAX(COALESCE(acquiredimage.acquireddate, 0)) DESC").
		Find(&targets).Error; err != nil {
		return nil, fmt.Errorf("failed to list targets: %w", err)
	}
	return targets, nil
}

func (g *Gorm) GetTargetByID(id int) (*targetscheduler.Target, error) {
	var target targetscheduler.Target
	if err := g.db.First(&target, id).Error; err != nil {
		return nil, fmt.Errorf("failed to get target by ID: %w", err)
	}
	return &target, nil
}

func (g *Gorm) GetTargetImageStats(targetID int) (v1.TargetImageStatsResponse, error) {
	var response v1.TargetImageStatsResponse
	response.Filters = make(map[string]v1.TargetImageStats)

	// Get last image date for this target
	var lastImageDate sql.NullInt64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Where("\"targetId\" = ?", targetID).
		Select("MAX(acquireddate)").
		Scan(&lastImageDate).Error; err != nil {
		return response, fmt.Errorf("failed to get last image date: %w", err)
	}
	if lastImageDate.Valid {
		response.LastImageDate = int(lastImageDate.Int64)
	}

	// Get total stats for this target
	var totalStats v1.TargetImageStats

	// Get total acquired images for this target
	var acquiredCount int64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Where("\"targetId\" = ?", targetID).
		Count(&acquiredCount).Error; err != nil {
		return response, fmt.Errorf("failed to count acquired images: %w", err)
	}
	totalStats.AcquiredImages = int(acquiredCount)

	// Get accepted images (gradingStatus = 1)
	var acceptedCount int64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Where("\"targetId\" = ? AND \"gradingStatus\" = ?", targetID, 1).
		Count(&acceptedCount).Error; err != nil {
		return response, fmt.Errorf("failed to count accepted images: %w", err)
	}
	totalStats.AcceptedImages = int(acceptedCount)

	// Get rejected images (gradingStatus = 2)
	var rejectedCount int64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Where("\"targetId\" = ? AND \"gradingStatus\" = ?", targetID, 2).
		Count(&rejectedCount).Error; err != nil {
		return response, fmt.Errorf("failed to count rejected images: %w", err)
	}
	totalStats.RejectedImages = int(rejectedCount)

	// Get desired images from exposure plans for this target
	var desiredSum int
	if err := g.db.Model(&targetscheduler.ExposurePlan{}).
		Where("targetid = ?", targetID).
		Select("COALESCE(SUM(desired), 0)").
		Scan(&desiredSum).Error; err != nil {
		return response, fmt.Errorf("failed to sum desired images: %w", err)
	}
	totalStats.DesiredImages = desiredSum

	response.Total = totalStats

	// Get stats per exposure template (not just filter)
	type ExposureTemplateStats struct {
		ExposureTemplateID int
		FilterName         string
		DefaultExposure    *float64
		Gain               *int
		Offset             *int
		AcquiredCount      int64
		AcceptedCount      int64
		RejectedCount      int64
	}

	var templateStats []ExposureTemplateStats
	if err := g.db.Table("acquiredimage as ai").
		Select(`COALESCE(et."Id", 0) as exposure_template_id, 
			COALESCE(et.filtername, ai.filtername) as filter_name, 
			et.defaultexposure as default_exposure, 
			et.gain, 
			et.offset, 
			COUNT(*) as acquired_count,
			SUM(CASE WHEN ai."gradingStatus" = 1 THEN 1 ELSE 0 END) as accepted_count,
			SUM(CASE WHEN ai."gradingStatus" = 2 THEN 1 ELSE 0 END) as rejected_count`).
		Joins("LEFT JOIN exposureplan ep ON ai.\"exposureId\" = ep.\"Id\"").
		Joins("LEFT JOIN exposuretemplate et ON ep.\"exposureTemplateId\" = et.\"Id\"").
		Where("ai.\"targetId\" = ?", targetID).
		Group("COALESCE(et.\"Id\", 0), COALESCE(et.filtername, ai.filtername), et.defaultexposure, et.gain, et.offset").
		Scan(&templateStats).Error; err != nil {
		return response, fmt.Errorf("failed to get exposure template stats: %w", err)
	}

	// Get desired counts per exposure template from exposure plans
	type ExposureTemplateDesired struct {
		ExposureTemplateID int
		FilterName         string
		DefaultExposure    *float64
		Gain               *int
		Offset             *int
		Desired            int
	}

	var templateDesired []ExposureTemplateDesired
	if err := g.db.Table("exposureplan AS ep").
		Select(`et."Id" as exposure_template_id, et.filtername as filter_name, et.defaultexposure as default_exposure, et.gain, et.offset, COALESCE(SUM(ep.desired), 0) as desired`).
		Joins("JOIN exposuretemplate et ON ep.\"exposureTemplateId\" = et.\"Id\"").
		Where("ep.targetid = ?", targetID).
		Group("et.\"Id\", et.filtername, et.defaultexposure, et.gain, et.offset").
		Scan(&templateDesired).Error; err != nil {
		return response, fmt.Errorf("failed to get exposure template desired counts: %w", err)
	}

	// Build desired map for easy lookup
	desiredMap := make(map[int]int) // key: ExposureTemplateID
	for _, td := range templateDesired {
		desiredMap[td.ExposureTemplateID] = td.Desired
	}

	// Populate stats per exposure template
	for _, ts := range templateStats {
		// Skip orphaned images (those without an exposure template)
		if ts.ExposureTemplateID == 0 {
			continue
		}

		// Build human-readable key with filter name and exposure settings
		filterName := ts.FilterName
		if filterName == "" {
			filterName = "Unknown Filter"
		}

		var parts []string
		if ts.DefaultExposure != nil && *ts.DefaultExposure > 0 {
			parts = append(parts, fmt.Sprintf("Exp: %.1fs", *ts.DefaultExposure))
		}
		if ts.Gain != nil {
			parts = append(parts, fmt.Sprintf("Gain: %d", *ts.Gain))
		}
		if ts.Offset != nil {
			parts = append(parts, fmt.Sprintf("Offset: %d", *ts.Offset))
		}

		var key string
		if len(parts) > 0 {
			key = filterName + " ("
			for i, part := range parts {
				if i > 0 {
					key += ", "
				}
				key += part
			}
			key += ")"
		} else {
			// No settings available, just use filter name
			key = filterName
		}

		response.Filters[key] = v1.TargetImageStats{
			AcquiredImages: int(ts.AcquiredCount),
			AcceptedImages: int(ts.AcceptedCount),
			RejectedImages: int(ts.RejectedCount),
			DesiredImages:  desiredMap[ts.ExposureTemplateID],
		}
	}

	// Add templates that have desired counts but no acquired images yet
	for _, td := range templateDesired {
		// Build human-readable key with filter name and exposure settings
		filterName := td.FilterName
		if filterName == "" {
			filterName = "Unknown Filter"
		}

		var parts []string
		if td.DefaultExposure != nil && *td.DefaultExposure > 0 {
			parts = append(parts, fmt.Sprintf("Exp: %.1fs", *td.DefaultExposure))
		}
		if td.Gain != nil {
			parts = append(parts, fmt.Sprintf("Gain: %d", *td.Gain))
		}
		if td.Offset != nil {
			parts = append(parts, fmt.Sprintf("Offset: %d", *td.Offset))
		}

		var key string
		if len(parts) > 0 {
			key = filterName + " ("
			for i, part := range parts {
				if i > 0 {
					key += ", "
				}
				key += part
			}
			key += ")"
		} else {
			// No settings available, just use filter name
			key = filterName
		}

		if _, exists := response.Filters[key]; !exists {
			response.Filters[key] = v1.TargetImageStats{
				DesiredImages: td.Desired,
			}
		}
	}

	return response, nil
}

func (g *Gorm) ListProjects() ([]targetscheduler.Project, error) {
	var projects []targetscheduler.Project
	if err := g.db.
		Select("project.*").
		Joins("LEFT JOIN target ON target.projectid = project.\"Id\"").
		Joins("LEFT JOIN acquiredimage ON acquiredimage.\"targetId\" = target.\"Id\"").
		Group("project.\"Id\"").
		Order("MAX(COALESCE(acquiredimage.acquireddate, 0)) DESC").
		Find(&projects).Error; err != nil {
		return nil, fmt.Errorf("failed to list projects: %w", err)
	}
	return projects, nil
}

func (g *Gorm) GetProjectByID(id int) (*targetscheduler.Project, error) {
	var project targetscheduler.Project
	if err := g.db.First(&project, id).Error; err != nil {
		return nil, fmt.Errorf("failed to get project by ID: %w", err)
	}
	return &project, nil
}

func (g *Gorm) ListTargetsByProjectID(projectID int) ([]targetscheduler.Target, error) {
	var targets []targetscheduler.Target
	if err := g.db.
		Select("target.*").
		Joins("LEFT JOIN acquiredimage ON acquiredimage.\"targetId\" = target.\"Id\"").
		Where("target.projectid = ?", projectID).
		Group("target.\"Id\"").
		Order("MAX(COALESCE(acquiredimage.acquireddate, 0)) DESC").
		Find(&targets).Error; err != nil {
		return nil, fmt.Errorf("failed to list targets by project ID: %w", err)
	}
	return targets, nil
}

func (g *Gorm) GetProjectImageStats(projectID int) (v1.ProjectStatsResponse, error) {
	var response v1.ProjectStatsResponse

	// Get total stats for this project
	var totalStats v1.TargetImageStats

	// Get last image date for this project
	var lastImageDate sql.NullInt64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Joins("JOIN target ON acquiredimage.\"targetId\" = target.\"Id\"").
		Where("target.projectid = ?", projectID).
		Select("MAX(acquireddate)").
		Scan(&lastImageDate).Error; err != nil {
		return response, fmt.Errorf("failed to get last image date: %w", err)
	}
	if lastImageDate.Valid {
		response.LastImageDate = int(lastImageDate.Int64)
	}

	// Get total acquired images for this project
	var acquiredCount int64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Joins("JOIN target ON acquiredimage.\"targetId\" = target.\"Id\"").
		Where("target.projectid = ?", projectID).
		Count(&acquiredCount).Error; err != nil {
		return response, fmt.Errorf("failed to count acquired images: %w", err)
	}
	totalStats.AcquiredImages = int(acquiredCount)

	// Get accepted images (gradingStatus = 1)
	var acceptedCount int64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Joins("JOIN target ON acquiredimage.\"targetId\" = target.\"Id\"").
		Where("target.projectid = ? AND acquiredimage.\"gradingStatus\" = ?", projectID, 1).
		Count(&acceptedCount).Error; err != nil {
		return response, fmt.Errorf("failed to count accepted images: %w", err)
	}
	totalStats.AcceptedImages = int(acceptedCount)

	// Get rejected images (gradingStatus = 2)
	var rejectedCount int64
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Joins("JOIN target ON acquiredimage.\"targetId\" = target.\"Id\"").
		Where("target.projectid = ? AND acquiredimage.\"gradingStatus\" = ?", projectID, 2).
		Count(&rejectedCount).Error; err != nil {
		return response, fmt.Errorf("failed to count rejected images: %w", err)
	}
	totalStats.RejectedImages = int(rejectedCount)

	// Get desired images from exposure plans for this project
	var desiredSum int
	if err := g.db.Model(&targetscheduler.ExposurePlan{}).
		Joins("JOIN target ON exposureplan.targetid = target.\"Id\"").
		Where("target.projectid = ?", projectID).
		Select("COALESCE(SUM(exposureplan.desired), 0)").
		Scan(&desiredSum).Error; err != nil {
		return response, fmt.Errorf("failed to sum desired images: %w", err)
	}
	totalStats.DesiredImages = desiredSum

	response.AcceptedImages = totalStats.AcceptedImages
	response.RejectedImages = totalStats.RejectedImages
	response.AcquiredImages = totalStats.AcquiredImages
	response.DesiredImages = totalStats.DesiredImages

	return response, nil
}

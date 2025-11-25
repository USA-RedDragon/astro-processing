package gorm

import (
	"context"
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

	// Get stats per filter
	type FilterStats struct {
		FilterName    string
		AcquiredCount int64
		AcceptedCount int64
		RejectedCount int64
	}

	var filterStats []FilterStats
	if err := g.db.Model(&targetscheduler.AcquiredImage{}).
		Select("filtername as filter_name, COUNT(*) as acquired_count, "+
			"SUM(CASE WHEN \"gradingStatus\" = 1 THEN 1 ELSE 0 END) as accepted_count, "+
			"SUM(CASE WHEN \"gradingStatus\" = 2 THEN 1 ELSE 0 END) as rejected_count").
		Where("\"targetId\" = ?", targetID).
		Group("filtername").
		Scan(&filterStats).Error; err != nil {
		return response, fmt.Errorf("failed to get filter stats: %w", err)
	}

	// Get desired counts per filter from exposure plans
	type FilterDesired struct {
		FilterName string
		Desired    int
	}

	var filterDesired []FilterDesired
	if err := g.db.Table("exposureplan AS ep").
		Select("et.filtername as filter_name, COALESCE(SUM(ep.desired), 0) as desired").
		Joins("JOIN exposuretemplate et ON ep.\"exposureTemplateId\" = et.\"Id\"").
		Where("ep.targetid = ?", targetID).
		Group("et.filtername").
		Scan(&filterDesired).Error; err != nil {
		return response, fmt.Errorf("failed to get filter desired counts: %w", err)
	}

	// Build desired map for easy lookup
	desiredMap := make(map[string]int)
	for _, fd := range filterDesired {
		desiredMap[fd.FilterName] = fd.Desired
	}

	// Populate filter stats
	for _, fs := range filterStats {
		response.Filters[fs.FilterName] = v1.TargetImageStats{
			AcquiredImages: int(fs.AcquiredCount),
			AcceptedImages: int(fs.AcceptedCount),
			RejectedImages: int(fs.RejectedCount),
			DesiredImages:  desiredMap[fs.FilterName],
		}
	}

	// Add filters that have desired counts but no acquired images yet
	for filterName, desired := range desiredMap {
		if _, exists := response.Filters[filterName]; !exists {
			response.Filters[filterName] = v1.TargetImageStats{
				DesiredImages: desired,
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

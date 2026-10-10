package resolvers

import (
	"context"
	"fmt"

	"github.com/USA-RedDragon/astro-processing/internal/server/graph/model"
	"github.com/USA-RedDragon/astro-processing/internal/utils"
)

func (r *projectStatsResolver) planCounts(ctx context.Context) (int32, int32, error) {
	project, err := utils.FindParent[*model.Project](ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("could not find parent project for plan counts: %w", err)
	}
	var row struct {
		Total int32
		Met   int32
	}
	accepted := r.db.Table("acquiredimage").
		Select(`"exposureId" AS exposure_id, COUNT(*) AS accepted`).
		Where(`"gradingStatus" = 1 AND "targetId" IN (SELECT "Id" FROM target WHERE projectid = ?)`, project.ID).
		Group("exposure_id")
	if err := r.db.WithContext(ctx).Table("exposureplan AS ep").
		Select(`COUNT(*) AS total, COALESCE(SUM(CASE WHEN COALESCE(ai.accepted, 0) >= ep.desired THEN 1 ELSE 0 END), 0) AS met`).
		Joins(`JOIN target t ON ep.targetid = t."Id"`).
		Joins(`LEFT JOIN (?) ai ON ai.exposure_id = ep."Id"`, accepted).
		Where("t.projectid = ? AND ep.enabled = 1 AND ep.desired IS NOT NULL", project.ID).
		Scan(&row).Error; err != nil {
		return 0, 0, fmt.Errorf("failed to count plans: %w", err)
	}
	return row.Total, row.Met, nil
}

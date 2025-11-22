package targets

import (
	"strconv"

	v1APIModels "github.com/USA-RedDragon/astro-processing/internal/server/apimodels/v1"
	"github.com/USA-RedDragon/astro-processing/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

func ListTargets(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	targets, err := di.Store.ListTargets()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}

	cleanedTargets := make([]v1APIModels.CleanedTarget, len(targets))
	for i, target := range targets {
		cleanedTargets[i] = v1APIModels.CleanedTarget{
			Target: target,
			Active: target.Active == 1,
		}
	}

	resp := v1APIModels.ListTargetsResponse{
		Targets: cleanedTargets,
	}
	c.JSON(200, resp)
}

func GetTarget(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	targetID := c.Param("target_id")
	targetIDInt, err := strconv.Atoi(targetID)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid target ID"})
		return
	}
	target, err := di.Store.GetTargetByID(targetIDInt)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if target == nil {
		c.JSON(404, gin.H{"error": "target not found"})
		return
	}
	cleanedTarget := v1APIModels.CleanedTarget{
		Target: *target,
		Active: target.Active == 1,
	}
	c.JSON(200, cleanedTarget)
}

func GetTargetImageStats(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	targetID := c.Param("target_id")
	targetIDInt, err := strconv.Atoi(targetID)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid target ID"})
		return
	}
	stats, err := di.Store.GetTargetImageStats(targetIDInt)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, stats)
}

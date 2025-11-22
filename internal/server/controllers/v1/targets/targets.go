package targets

import (
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
	resp := v1APIModels.ListTargetsResponse{
		Targets: targets,
	}
	c.JSON(200, resp)
}

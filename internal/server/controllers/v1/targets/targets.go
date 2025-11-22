package targets

import (
	v1APIModels "github.com/USA-RedDragon/astro-processing/internal/server/apimodels/v1"
	"github.com/USA-RedDragon/astro-processing/internal/server/middleware"
	"github.com/USA-RedDragon/astro-processing/internal/store/models/targetscheduler"
	"github.com/gin-gonic/gin"
)

func ListTargets(c *gin.Context) {
	c.MustGet(middleware.DepInjectionKey)
	resp := v1APIModels.ListTargetsResponse{
		Targets: []targetscheduler.Target{},
	}
	c.JSON(200, resp)
}

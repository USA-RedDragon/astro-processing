package server

import (
	"net/http"

	v1ProjectsControllers "github.com/USA-RedDragon/astro-processing/internal/server/controllers/v1/projects"
	v1TargetsControllers "github.com/USA-RedDragon/astro-processing/internal/server/controllers/v1/targets"
	"github.com/USA-RedDragon/astro-processing/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

func applyRoutes(r *gin.Engine) {
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"state": "OK"})
	})

	v1(r.Group("/api/v1"))
}

func v1(r *gin.RouterGroup) {
	r.GET("/version", func(c *gin.Context) {
		di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
		c.String(http.StatusOK, "%s", di.Version)
	})
	v1Projects := r.Group("/projects")
	v1Projects.GET("", v1ProjectsControllers.ListProjects)
	v1Projects.GET("/:project_id", v1ProjectsControllers.GetProject)
	v1Projects.GET("/:project_id/stats", v1ProjectsControllers.GetProjectStats)
	v1Projects.GET("/:project_id/targets", v1ProjectsControllers.ListProjectTargets)

	v1Targets := r.Group("/targets")
	v1Targets.GET("", v1TargetsControllers.ListTargets)
	v1Targets.GET("/:target_id", v1TargetsControllers.GetTarget)
	v1Targets.GET("/:target_id/image/stats", v1TargetsControllers.GetTargetImageStats)
}

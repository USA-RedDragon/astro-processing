package projects

import (
	"strconv"

	v1APIModels "github.com/USA-RedDragon/astro-processing/internal/server/apimodels/v1"
	"github.com/USA-RedDragon/astro-processing/internal/server/middleware"
	"github.com/gin-gonic/gin"
)

func ListProjects(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	projects, err := di.Store.ListProjects()
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	resp := v1APIModels.ListProjectsResponse{
		Projects: projects,
	}
	c.JSON(200, resp)
}

func GetProject(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	projectIDStr := c.Param("project_id")
	projectID, err := strconv.Atoi(projectIDStr)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid project_id"})
		return
	}
	project, err := di.Store.GetProjectByID(projectID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if project == nil {
		c.JSON(404, gin.H{"error": "project not found"})
		return
	}
	c.JSON(200, project)
}

func GetProjectStats(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	projectIDStr := c.Param("project_id")
	projectID, err := strconv.Atoi(projectIDStr)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid project_id"})
		return
	}
	stats, err := di.Store.GetProjectImageStats(projectID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	c.JSON(200, stats)
}

func ListProjectTargets(c *gin.Context) {
	di := c.MustGet(middleware.DepInjectionKey).(*middleware.DepInjection)
	projectIDStr := c.Param("project_id")
	projectID, err := strconv.Atoi(projectIDStr)
	if err != nil {
		c.JSON(400, gin.H{"error": "invalid project_id"})
		return
	}
	targets, err := di.Store.ListTargetsByProjectID(projectID)
	if err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	resp := v1APIModels.ListProjectTargetsResponse{
		Targets: targets,
	}
	c.JSON(200, resp)
}

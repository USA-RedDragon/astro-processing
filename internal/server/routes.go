package server

import (
	"net/http"

	v1TargetsControllers "github.com/USA-RedDragon/astro-processing/internal/server/controllers/v1/targets"
	"github.com/gin-gonic/gin"
)

func applyRoutes(r *gin.Engine) {
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"state": "OK"})
	})

	v1(r.Group("/api/v1"))
}

func v1(r *gin.RouterGroup) {
	v1Targets := r.Group("/targets")
	v1Targets.GET("", v1TargetsControllers.ListTargets)
}

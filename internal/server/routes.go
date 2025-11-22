package server

import (
	"net/http"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/gin-gonic/gin"
)

func applyRoutes(r *gin.Engine, _ *config.Config) {
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"state": "OK"})
	})
}

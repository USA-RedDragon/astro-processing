package server

import (
	"fmt"
	"net/http"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/gin-gonic/gin"
)

func applyRoutes(r *gin.Engine, config *config.Config, version string, commit string) error {
	r.GET("/ping", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"state": "OK"})
	})
	graphqlHandlerFunc, err := graphqlHandler(config, version, commit)
	if err != nil {
		return fmt.Errorf("failed to create graphql handler: %w", err)
	}
	r.POST("/query", graphqlHandlerFunc)
	r.GET("/query", graphqlPlaygroundHandler())

	return nil
}

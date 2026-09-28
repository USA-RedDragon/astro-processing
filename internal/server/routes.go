package server

import (
	"context"
	"fmt"
	"net/http"
	"strings"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/events"
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

	// Rendered previews, updated masters and what the worker is doing, as
	// server-sent events.
	relay := events.NewRelay()
	if config.Worker.URL != "" {
		go relay.Run(context.Background(), strings.TrimRight(config.Worker.URL, "/")+"/api/v1/events")
	}
	r.GET("/events", gin.WrapH(relay))

	return nil
}

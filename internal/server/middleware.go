package server

import (
	"log/slog"

	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/gin-gonic/gin"
)

func applyMiddleware(r *gin.Engine, config *config.Config) {
	r.Use(gin.Recovery())
	r.Use(gin.Logger())
	r.TrustedPlatform = "X-Real-IP"

	err := r.SetTrustedProxies(config.HTTP.TrustedProxies)
	if err != nil {
		slog.Error("Failed to set trusted proxies", "error", err.Error())
	}
}

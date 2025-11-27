package middleware

import (
	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/gin-gonic/gin"
)

type DepInjection struct {
	Config  *config.Config
	Version string
}

const DepInjectionKey = "DepInjection"

func Inject(inj *DepInjection) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(DepInjectionKey, inj)
		c.Next()
	}
}

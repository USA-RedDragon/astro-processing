package middleware

import (
	"github.com/USA-RedDragon/astro-processing/internal/config"
	"github.com/USA-RedDragon/astro-processing/internal/store"
	"github.com/gin-gonic/gin"
)

type DepInjection struct {
	Config  *config.Config
	Store   store.Store
	Version string
}

const DepInjectionKey = "DepInjection"

func Inject(inj *DepInjection) gin.HandlerFunc {
	return func(c *gin.Context) {
		inj.Store = inj.Store.WithContext(c.Request.Context())
		c.Set(DepInjectionKey, inj)
		c.Next()
	}
}

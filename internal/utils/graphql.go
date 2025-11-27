package utils

import (
	"context"
	"fmt"

	"github.com/99designs/gqlgen/graphql"
)

// FindParent finds the nearest parent of type T in the GraphQL resolver context.
// It returns an error if no such parent is found.
func FindParent[T any](ctx context.Context) (T, error) {
	for p := graphql.GetFieldContext(ctx); p != nil; p = p.Parent {
		if p.Result != nil {
			if thing, ok := p.Result.(T); ok {
				return thing, nil
			}
			if ptr, ok := p.Result.(*T); ok && ptr != nil {
				return *ptr, nil
			}
		}
	}
	return *new(T), fmt.Errorf("could not find parent of type %T", *new(T))
}

import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: '../graph/*.graphqls',
  documents: ['src/**/*.graphql', 'src/**/*.ts', 'src/**/*.vue'],
  ignoreNoDocuments: true,
  generates: {
    './src/graphql/': {
      preset: 'client',
      // The client preset only emits operation types since v6; the app
      // also uses the schema's object types.
      plugins: ['typescript'],
      config: {
        documentMode: 'string',
        useTypeImports: true
      }
    },
    './src/graphql/schema.graphql': {
      plugins: ['schema-ast'],
      config: {
        includeDirectives: true
      }
    }
  }
}

export default config

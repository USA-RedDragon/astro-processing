import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: '../graph/*.graphqls',
  documents: ['src/**/*.graphql', 'src/**/*.ts', 'src/**/*.vue'],
  ignoreNoDocuments: true,
  generates: {
    './src/graphql/': {
      preset: 'client',
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

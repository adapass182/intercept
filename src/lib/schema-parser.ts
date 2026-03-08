// src/lib/schema-parser.ts
import type { OpenAPISpec, OpenAPISchema } from '../types'

export type Endpoint = {
  key: string       // "GET /api/users/{id}"
  method: string
  path: string
  tag: string
  summary: string
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

export function parseEndpoints(spec: OpenAPISpec): Endpoint[] {
  const endpoints: Endpoint[] = []

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const operation = pathItem[method]
      if (!operation) continue

      endpoints.push({
        key: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        tag: operation.tags?.[0] ?? 'Other',
        summary: operation.summary ?? '',
      })
    }
  }

  return endpoints
}

export function resolveSchema(
  schema: OpenAPISchema,
  componentSchemas: Record<string, OpenAPISchema>
): OpenAPISchema | undefined {
  if (!schema.$ref) return schema

  const name = schema.$ref.split('/').pop()
  if (!name) return undefined
  return componentSchemas[name]
}

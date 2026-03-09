// src/lib/default-generator.ts
import type { OpenAPISchema } from '../types'

export function generateDefaults(
  schema: OpenAPISchema,
  schemas: Record<string, OpenAPISchema>,
  depth = 0
): unknown {
  if (depth > 5) return null

  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() ?? ''
    const resolved = schemas[name]
    if (!resolved) return null
    return generateDefaults(resolved, schemas, depth + 1)
  }

  if (schema.enum) return schema.enum[0] ?? null

  switch (schema.type) {
    case 'string': return ''
    case 'integer':
    case 'number': return 0
    case 'boolean': return false
    case 'array': return []
    case 'object': {
      if (!schema.properties) return {}
      return Object.fromEntries(
        Object.entries(schema.properties).map(([k, v]) => [k, generateDefaults(v, schemas, depth + 1)])
      )
    }
    default: return null
  }
}

// src/panel/components/SchemaPreview.tsx
import type { OpenAPISchema } from '../../types'

type Props = {
  schema: OpenAPISchema | undefined
  schemas: Record<string, OpenAPISchema>
}

export function SchemaPreview({ schema, schemas }: Props) {
  if (!schema) {
    return (
      <div style={{ padding: 12, color: '#888', borderLeft: '1px solid #e0e0e0' }}>
        No schema available
      </div>
    )
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', borderLeft: '1px solid #e0e0e0', fontFamily: 'monospace', fontSize: 12 }}>
      <SchemaNode schema={schema} schemas={schemas} indent={0} seen={new Set()} />
    </div>
  )
}

function SchemaNode({
  schema,
  schemas,
  indent,
  seen,
}: {
  schema: OpenAPISchema
  schemas: Record<string, OpenAPISchema>
  indent: number
  seen: Set<string>
}) {
  const pad = '  '.repeat(indent)

  // Resolve $ref before rendering
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() ?? ''
    if (seen.has(name)) {
      return <span style={{ color: '#888' }}>{name} (circular)</span>
    }
    const resolved = schemas[name]
    if (!resolved) return <span style={{ color: '#888' }}>{name}</span>
    return <SchemaNode schema={resolved} schemas={schemas} indent={indent} seen={new Set([...seen, name])} />
  }

  if (schema.type === 'object' && schema.properties) {
    return (
      <span>
        {'{'}<br />
        {Object.entries(schema.properties).map(([key, val]) => (
          <span key={key}>
            {pad}{'  '}<span style={{ color: '#2b6cb0' }}>{key}</span>:{' '}
            <SchemaNode schema={val} schemas={schemas} indent={indent + 1} seen={seen} /><br />
          </span>
        ))}
        {pad}{'}'}
      </span>
    )
  }

  if (schema.type === 'array' && schema.items) {
    return (
      <span>
        Array&lt;<SchemaNode schema={schema.items} schemas={schemas} indent={indent} seen={seen} />&gt;
      </span>
    )
  }

  if (schema.enum) {
    return <span style={{ color: '#744210' }}>{schema.enum.map(String).join(' | ')}</span>
  }

  return <span style={{ color: '#276749' }}>{schema.type ?? 'unknown'}</span>
}

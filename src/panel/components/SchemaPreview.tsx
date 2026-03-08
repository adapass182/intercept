// src/panel/components/SchemaPreview.tsx
import type { OpenAPISchema } from '../../types'

type Props = { schema: OpenAPISchema | undefined }

export function SchemaPreview({ schema }: Props) {
  if (!schema) {
    return (
      <div style={{ padding: 12, color: '#888', borderLeft: '1px solid #e0e0e0' }}>
        No schema available
      </div>
    )
  }

  return (
    <div style={{ padding: 12, overflowY: 'auto', borderLeft: '1px solid #e0e0e0', fontFamily: 'monospace', fontSize: 12 }}>
      <SchemaNode schema={schema} indent={0} />
    </div>
  )
}

function SchemaNode({ schema, indent }: { schema: OpenAPISchema; indent: number }) {
  const pad = '  '.repeat(indent)

  if (schema.type === 'object' && schema.properties) {
    return (
      <span>
        {'{'}<br />
        {Object.entries(schema.properties).map(([key, val]) => (
          <span key={key}>
            {pad}{'  '}<span style={{ color: '#2b6cb0' }}>{key}</span>:{' '}
            <SchemaNode schema={val} indent={indent + 1} /><br />
          </span>
        ))}
        {pad}{'}'}
      </span>
    )
  }

  if (schema.type === 'array' && schema.items) {
    return <span>Array&lt;<SchemaNode schema={schema.items} indent={indent} />&gt;</span>
  }

  if (schema.enum) {
    return <span style={{ color: '#744210' }}>{schema.enum.map(String).join(' | ')}</span>
  }

  return <span style={{ color: '#276749' }}>{schema.type ?? 'unknown'}</span>
}

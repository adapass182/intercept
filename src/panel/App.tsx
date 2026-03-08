// src/panel/App.tsx
import { useState, useEffect } from 'react'
import type { OpenAPISpec, OpenAPISchema, Override } from '../types'
import { parseEndpoints, resolveSchema } from '../lib/schema-parser'
import type { Endpoint } from '../lib/schema-parser'
import { useOverrides } from './hooks/useOverrides'
import { EndpointList } from './components/EndpointList'
import { OverrideEditor } from './components/OverrideEditor'
import { SchemaPreview } from './components/SchemaPreview'

export function App() {
  const [specUrl, setSpecUrl] = useState('')
  const [spec, setSpec] = useState<OpenAPISpec | null>(null)
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')

  const { overrides, setOverride, deleteOverride } = useOverrides()

  useEffect(() => {
    chrome.storage.local.get('specUrl', (result) => {
      if (result.specUrl) setSpecUrl(result.specUrl as string)
    })
  }, [])

  async function loadSpec() {
    setLoadError('')
    try {
      const res = await fetch(specUrl)
      const json: OpenAPISpec = await res.json()
      setSpec(json)
      setEndpoints(parseEndpoints(json))
      chrome.storage.local.set({ specUrl })
    } catch (e) {
      setLoadError(`Failed to load spec: ${(e as Error).message}`)
    }
  }

  const selectedEndpoint = endpoints.find((e) => e.key === selectedKey)

  function getResponseSchema(): OpenAPISchema | undefined {
    if (!spec || !selectedEndpoint) return undefined
    const pathItem = spec.paths[selectedEndpoint.path]
    const operation = pathItem?.[selectedEndpoint.method.toLowerCase() as 'get']
    const response200 = operation?.responses?.['200']
    const schema = response200?.content?.['application/json']?.schema
    if (!schema) return undefined
    return resolveSchema(schema, spec.components?.schemas ?? {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #e0e0e0', background: '#fafafa' }}>
        <input
          value={specUrl}
          onChange={(e) => setSpecUrl(e.target.value)}
          placeholder="OpenAPI spec URL"
          style={{ flex: 1, padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
          onKeyDown={(e) => e.key === 'Enter' && loadSpec()}
        />
        <button
          onClick={loadSpec}
          style={{ padding: '4px 12px', background: '#2b6cb0', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          Load
        </button>
      </div>
      {loadError && <div style={{ padding: '4px 8px', color: 'red', fontSize: 12 }}>{loadError}</div>}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 220, flexShrink: 0 }}>
          <EndpointList
            endpoints={endpoints}
            overrides={overrides}
            selected={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {selectedKey ? (
            <OverrideEditor
              endpointKey={selectedKey}
              override={overrides[selectedKey]}
              responseSchema={getResponseSchema()}
              onSave={(override: Override) => setOverride(selectedKey, override)}
              onDelete={() => deleteOverride(selectedKey)}
            />
          ) : (
            <div style={{ padding: 24, color: '#888' }}>Select an endpoint to configure an override</div>
          )}
        </div>

        <div style={{ width: 220, flexShrink: 0 }}>
          <SchemaPreview schema={getResponseSchema()} />
        </div>
      </div>
    </div>
  )
}

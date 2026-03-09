// src/panel/App.tsx
import { useState, useEffect, useRef } from 'react'
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

  const [leftWidth, setLeftWidth] = useState(220)
  const [rightWidth, setRightWidth] = useState(260)
  const dragging = useRef<{ side: 'left' | 'right'; startX: number; startWidth: number } | null>(null)

  const { overrides, setOverride, deleteOverride } = useOverrides()

  useEffect(() => {
    chrome.storage.local.get('specUrl', (result) => {
      if (result.specUrl) setSpecUrl(result.specUrl as string)
    })
  }, [])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return
      const delta = e.clientX - dragging.current.startX
      if (dragging.current.side === 'left') {
        setLeftWidth(Math.max(140, Math.min(400, dragging.current.startWidth + delta)))
      } else {
        setRightWidth(Math.max(140, Math.min(400, dragging.current.startWidth - delta)))
      }
    }
    function onMouseUp() { dragging.current = null }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
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
  const allSchemas: Record<string, OpenAPISchema> = { ...spec?.components?.schemas, ...spec?.definitions }

  // Register the selected endpoint with the background so responses are captured even without an override
  useEffect(() => {
    if (!selectedEndpoint) return
    chrome.runtime.sendMessage({ type: 'WATCH_ENDPOINT', method: selectedEndpoint.method, path: selectedEndpoint.path })
  }, [selectedEndpoint])

  function getResponseSchema(): OpenAPISchema | undefined {
    if (!spec || !selectedEndpoint) return undefined
    const pathItem = spec.paths[selectedEndpoint.path]
    const operation = pathItem?.[selectedEndpoint.method.toLowerCase() as 'get']
    const response200 = operation?.responses?.['200']
    // OpenAPI 3.0: content['application/json'].schema — Swagger 2.0: schema directly on response
    const schema = response200?.content?.['application/json']?.schema ?? response200?.schema
    if (!schema) return undefined
    return resolveSchema(schema, allSchemas)
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
        <div style={{ width: leftWidth, flexShrink: 0, overflow: 'hidden' }}>
          <EndpointList
            endpoints={endpoints}
            overrides={overrides}
            selected={selectedKey}
            onSelect={setSelectedKey}
          />
        </div>

        <div
          onMouseDown={(e) => { dragging.current = { side: 'left', startX: e.clientX, startWidth: leftWidth }; e.preventDefault() }}
          style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: '#e0e0e0' }}
        />

        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
          {selectedKey ? (
            <OverrideEditor
              endpointKey={selectedKey}
              override={overrides[selectedKey]}
              responseSchema={getResponseSchema()}
              schemas={allSchemas}
              onSave={(override: Override) => setOverride(selectedKey, override)}
              onDelete={() => deleteOverride(selectedKey)}
            />
          ) : (
            <div style={{ padding: 24, color: '#888' }}>Select an endpoint to configure an override</div>
          )}
        </div>

        <div
          onMouseDown={(e) => { dragging.current = { side: 'right', startX: e.clientX, startWidth: rightWidth }; e.preventDefault() }}
          style={{ width: 4, flexShrink: 0, cursor: 'col-resize', background: '#e0e0e0' }}
        />

        <div style={{ width: rightWidth, flexShrink: 0, overflow: 'hidden' }}>
          <SchemaPreview
            schema={getResponseSchema()}
            schemas={allSchemas}
          />
        </div>
      </div>
    </div>
  )
}

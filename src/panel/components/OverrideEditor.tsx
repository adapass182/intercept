// src/panel/components/OverrideEditor.tsx
import { useState, useEffect } from 'react'
import type { Override, OpenAPISchema } from '../../types'

type Props = {
  endpointKey: string
  override: Override | undefined
  responseSchema: OpenAPISchema | undefined
  onSave: (override: Override) => void
  onDelete: () => void
}

const DEFAULT_OVERRIDE: Override = {
  enabled: true,
  statusCode: null,
  delayMs: null,
  bodyOverrides: {},
  rawBody: null,
}

export function OverrideEditor({ endpointKey, override, responseSchema, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Override>(override ?? DEFAULT_OVERRIDE)
  const [mode, setMode] = useState<'form' | 'raw'>('form')
  const [rawJson, setRawJson] = useState(override?.rawBody ?? '')
  const [jsonError, setJsonError] = useState('')

  useEffect(() => {
    setDraft(override ?? DEFAULT_OVERRIDE)
    setRawJson(override?.rawBody ?? '')
    setJsonError('')
  }, [endpointKey, override])

  const schemaFields =
    responseSchema?.type === 'object' && responseSchema.properties
      ? Object.entries(responseSchema.properties)
      : []

  function handleSave() {
    if (mode === 'raw') {
      try {
        JSON.parse(rawJson || '{}')
        setJsonError('')
        onSave({ ...draft, rawBody: rawJson || null })
      } catch {
        setJsonError('Invalid JSON')
      }
    } else {
      onSave({ ...draft, rawBody: null })
    }
  }

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 13, wordBreak: 'break-all' }}>{endpointKey}</div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ minWidth: 60, color: '#555' }}>Status</span>
        <input
          type="number"
          placeholder="(real)"
          value={draft.statusCode ?? ''}
          onChange={(e) => setDraft({ ...draft, statusCode: e.target.value ? Number(e.target.value) : null })}
          style={{ width: 80, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </label>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ minWidth: 60, color: '#555' }}>Delay ms</span>
        <input
          type="number"
          placeholder="0"
          value={draft.delayMs ?? ''}
          onChange={(e) => setDraft({ ...draft, delayMs: e.target.value ? Number(e.target.value) : null })}
          style={{ width: 80, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 12 }}>
        {(['form', 'raw'] as const).map((m) => (
          <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="radio" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'form' ? 'Form' : 'Raw JSON'}
          </label>
        ))}
      </div>

      {mode === 'form' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {schemaFields.length === 0 ? (
            <span style={{ color: '#888', fontSize: 12 }}>No schema fields available</span>
          ) : (
            schemaFields.map(([field]) => (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 100, color: '#2b6cb0', fontFamily: 'monospace', fontSize: 12 }}>{field}</span>
                <input
                  placeholder="(real value)"
                  value={(draft.bodyOverrides[field] as string) ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      bodyOverrides: { ...draft.bodyOverrides, [field]: e.target.value || undefined },
                    })
                  }
                  style={{ flex: 1, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                />
              </label>
            ))
          )}
        </div>
      ) : (
        <div>
          <textarea
            value={rawJson}
            onChange={(e) => { setRawJson(e.target.value); setJsonError('') }}
            placeholder="{}"
            rows={8}
            style={{
              width: '100%',
              fontFamily: 'monospace',
              fontSize: 12,
              padding: 6,
              border: `1px solid ${jsonError ? 'red' : '#ccc'}`,
              borderRadius: 4,
            }}
          />
          {jsonError && <div style={{ color: 'red', fontSize: 11 }}>{jsonError}</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          style={{ padding: '5px 14px', background: '#2b6cb0', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
        >
          {override ? 'Update' : 'Save'}
        </button>
        {override && (
          <button
            onClick={() => onSave({ ...override, enabled: !override.enabled })}
            style={{ padding: '5px 14px', background: '#718096', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            {override.enabled ? 'Disable' : 'Enable'}
          </button>
        )}
        {override && (
          <button
            onClick={onDelete}
            style={{ padding: '5px 14px', background: '#e53e3e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

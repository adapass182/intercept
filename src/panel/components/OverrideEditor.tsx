// src/panel/components/OverrideEditor.tsx
import { useState, useEffect } from 'react'
import type { Override, OpenAPISchema } from '../../types'
import { generateDefaults } from '../../lib/default-generator'
import { sendMessage } from '../lib/messaging'

type Props = {
  endpointKey: string
  override: Override | undefined
  responseSchema: OpenAPISchema | undefined
  schemas: Record<string, OpenAPISchema>
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

// Display any JSON value as a string for form inputs
function displayValue(v: unknown): string {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}

// Parse a string from a form input into an appropriate JSON type
function parseValue(s: string): unknown {
  if (s === '') return undefined
  try { return JSON.parse(s) } catch { return s }
}

function resolveFieldSchema(schema: OpenAPISchema, schemas: Record<string, OpenAPISchema>): OpenAPISchema {
  if (schema.$ref) {
    const name = schema.$ref.split('/').pop() ?? ''
    return schemas[name] ?? schema
  }
  return schema
}

function isComplex(schema: OpenAPISchema): boolean {
  return schema.type === 'object' || schema.type === 'array' || !!schema.$ref
}

export function OverrideEditor({ endpointKey, override, responseSchema, schemas, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Override>(override ?? DEFAULT_OVERRIDE)
  const [mode, setMode] = useState<'form' | 'raw'>('form')
  const [rawJson, setRawJson] = useState(override?.rawBody ?? '')
  const [jsonError, setJsonError] = useState('')
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    setDraft(override ?? DEFAULT_OVERRIDE)
    setRawJson(override?.rawBody ?? '')
    setJsonError('')
    // Check if a real response has been captured for this endpoint
    sendMessage<Record<string, unknown>>({ type: 'GET_REAL_RESPONSE', key: endpointKey }).then((resp) => {
      setLastResponse(resp && typeof resp === 'object' ? resp : null)
    })
  }, [endpointKey, override])

  const schemaFields =
    responseSchema?.type === 'object' && responseSchema.properties
      ? Object.entries(responseSchema.properties)
      : []

  function handleFillDefaults() {
    if (!responseSchema) return
    const defaults = generateDefaults(responseSchema, schemas)
    if (typeof defaults === 'object' && defaults !== null) {
      const stringified = Object.fromEntries(
        Object.entries(defaults as Record<string, unknown>).map(([k, v]) => [k, displayValue(v)])
      )
      setDraft((prev) => ({ ...prev, bodyOverrides: stringified }))
    }
  }

  function handleUseLastResponse() {
    if (!lastResponse) return
    const stringified = Object.fromEntries(
      Object.entries(lastResponse).map(([k, v]) => [k, displayValue(v)])
    )
    setDraft((prev) => ({ ...prev, bodyOverrides: stringified }))
    setMode('form')
  }

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
      // Parse field values to proper JSON types; drop empty fields
      const parsedOverrides = Object.fromEntries(
        Object.entries(draft.bodyOverrides)
          .map(([k, v]) => [k, parseValue(String(v ?? ''))])
          .filter(([, v]) => v !== undefined)
      )
      onSave({ ...draft, bodyOverrides: parsedOverrides, rawBody: null })
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

      {/* Prefill actions */}
      {schemaFields.length > 0 && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleFillDefaults}
            style={{ padding: '3px 10px', fontSize: 11, background: '#f0f4ff', border: '1px solid #c3d0f0', borderRadius: 4, cursor: 'pointer', color: '#2b6cb0' }}
          >
            Fill defaults
          </button>
          <button
            onClick={handleUseLastResponse}
            disabled={!lastResponse}
            title={lastResponse ? 'Seed form with last captured real response' : 'No response captured yet — make a request first'}
            style={{
              padding: '3px 10px', fontSize: 11, borderRadius: 4, cursor: lastResponse ? 'pointer' : 'not-allowed',
              background: lastResponse ? '#f0fff4' : '#f5f5f5',
              border: `1px solid ${lastResponse ? '#9ae6b4' : '#ddd'}`,
              color: lastResponse ? '#276749' : '#aaa',
            }}
          >
            Use last response
          </button>
        </div>
      )}

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
            schemaFields.map(([field, rawFieldSchema]) => {
              const fieldSchema = resolveFieldSchema(rawFieldSchema, schemas)
              const complex = isComplex(fieldSchema)
              const currentVal = displayValue(draft.bodyOverrides[field])

              const onChange = (val: string) =>
                setDraft({ ...draft, bodyOverrides: { ...draft.bodyOverrides, [field]: val } })

              return (
                <div key={field} style={{ display: 'flex', alignItems: complex ? 'flex-start' : 'center', gap: 8 }}>
                  <span style={{ minWidth: 100, paddingTop: complex ? 4 : 0, color: '#2b6cb0', fontFamily: 'monospace', fontSize: 12, flexShrink: 0 }}>
                    {field}
                  </span>
                  {fieldSchema.enum ? (
                    <select
                      value={currentVal}
                      onChange={(e) => onChange(e.target.value)}
                      style={{ flex: 1, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4, fontSize: 12 }}
                    >
                      <option value="">(real value)</option>
                      {fieldSchema.enum.map((v) => (
                        <option key={String(v)} value={String(v)}>{String(v)}</option>
                      ))}
                    </select>
                  ) : complex ? (
                    <textarea
                      value={currentVal}
                      onChange={(e) => onChange(e.target.value)}
                      placeholder="(real value)"
                      rows={3}
                      style={{ flex: 1, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
                    />
                  ) : (
                    <input
                      placeholder="(real value)"
                      value={currentVal}
                      onChange={(e) => onChange(e.target.value)}
                      style={{ flex: 1, padding: '3px 6px', border: '1px solid #ccc', borderRadius: 4 }}
                    />
                  )}
                </div>
              )
            })
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

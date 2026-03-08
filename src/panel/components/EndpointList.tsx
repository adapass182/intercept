// src/panel/components/EndpointList.tsx
import { useState } from 'react'
import type { Endpoint } from '../../lib/schema-parser'
import type { OriginOverrides } from '../../types'

type Props = {
  endpoints: Endpoint[]
  overrides: OriginOverrides
  selected: string | null
  onSelect: (key: string) => void
}

export function EndpointList({ endpoints, overrides, selected, onSelect }: Props) {
  const [search, setSearch] = useState('')

  const filtered = endpoints.filter(
    (e) =>
      e.path.toLowerCase().includes(search.toLowerCase()) ||
      e.tag.toLowerCase().includes(search.toLowerCase())
  )

  const grouped = filtered.reduce<Record<string, Endpoint[]>>((acc, e) => {
    ;(acc[e.tag] ??= []).push(e)
    return acc
  }, {})

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderRight: '1px solid #e0e0e0' }}>
      <div style={{ padding: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search endpoints..."
          style={{ width: '100%', padding: '4px 8px', border: '1px solid #ccc', borderRadius: 4 }}
        />
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {Object.entries(grouped).map(([tag, items]) => (
          <div key={tag}>
            <div style={{ padding: '4px 8px', fontWeight: 600, background: '#f5f5f5', fontSize: 11, color: '#666' }}>
              {tag}
            </div>
            {items.map((e) => {
              const hasActiveOverride = !!overrides[e.key]?.enabled
              return (
                <div
                  key={e.key}
                  onClick={() => onSelect(e.key)}
                  style={{
                    padding: '6px 12px',
                    cursor: 'pointer',
                    background: selected === e.key ? '#e8f0fe' : 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span style={{ color: methodColor(e.method), fontWeight: 600, fontSize: 10, minWidth: 36 }}>
                    {e.method}
                  </span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.path}
                  </span>
                  {hasActiveOverride && <span style={{ color: '#e53e3e', fontSize: 10 }}>●</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function methodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: '#2b6cb0', POST: '#276749', PUT: '#744210', PATCH: '#553c9a', DELETE: '#9b2c2c',
  }
  return colors[method] ?? '#555'
}

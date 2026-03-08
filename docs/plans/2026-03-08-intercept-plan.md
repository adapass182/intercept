# Intercept Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Chrome DevTools extension that reads an OpenAPI spec and lets you override API responses in-browser, with schema-driven editing and per-origin persistence.

**Architecture:** Chrome MV3 extension with a React+TypeScript DevTools panel, a background service worker holding override state, and an injected script that monkey-patches `window.fetch`/`XMLHttpRequest` to return synthetic responses. Communication flows: panel ↔ background worker ↔ content script ↔ injected script.

**Tech Stack:** React 18, TypeScript, Vite, `@crxjs/vite-plugin`, Vitest, `chrome.storage.local`

---

## Project Structure

```
intercept/
├── manifest.json
├── vite.config.ts
├── package.json
├── tsconfig.json
├── src/
│   ├── types.ts                      # shared types
│   ├── background/
│   │   └── service-worker.ts         # override state + message handler
│   ├── content/
│   │   └── content-script.ts         # injects script, bridges messages
│   ├── injected/
│   │   └── injected.ts               # monkey-patches fetch/XHR
│   ├── devtools/
│   │   ├── devtools.html             # devtools entry point
│   │   └── devtools.ts               # creates the panel
│   ├── panel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── EndpointList.tsx
│   │   │   ├── OverrideEditor.tsx
│   │   │   └── SchemaPreview.tsx
│   │   └── hooks/
│   │       └── useOverrides.ts
│   └── lib/
│       ├── path-matcher.ts
│       ├── body-merger.ts
│       └── schema-parser.ts
├── test/
│   ├── path-matcher.test.ts
│   ├── body-merger.test.ts
│   └── schema-parser.test.ts
└── test-harness/
    ├── index.html
    └── main.ts
```

---

### Task 1: Scaffold the project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `manifest.json`

**Step 1: Initialise npm and install dependencies**

```bash
cd /Users/adam/Code/intercept
npm init -y
npm install react react-dom
npm install -D typescript vite @crxjs/vite-plugin @vitejs/plugin-react @types/react @types/react-dom @types/chrome vitest
```

**Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

**Step 3: Write `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "intercept",
  "version": "0.1.0",
  "description": "OpenAPI-aware API response overrides for Chrome DevTools",
  "permissions": ["storage", "tabs", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "src/background/service-worker.ts",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content/content-script.ts"],
      "run_at": "document_start"
    }
  ],
  "devtools_page": "src/devtools/devtools.html",
  "web_accessible_resources": [
    {
      "resources": ["src/injected/injected.js"],
      "matches": ["<all_urls>"]
    }
  ]
}
```

**Step 4: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  test: {
    environment: 'node',
  },
})
```

**Step 5: Verify build runs**

```bash
npx vite build
```
Expected: build succeeds (may warn about missing entry files — that's fine for now).

**Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts manifest.json
git commit -m "chore: scaffold project with Vite + crxjs + React"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/types.ts`

**Step 1: Write types**

```ts
// src/types.ts

export type Override = {
  enabled: boolean
  statusCode: number | null   // null = use real status code
  delayMs: number | null      // null = no delay
  bodyOverrides: Record<string, unknown>  // field-level patches
  rawBody: string | null      // if set, replaces body entirely
}

// key format: "GET /api/users/{id}"
export type OriginOverrides = Record<string, Override>

// chrome.storage.local shape: { [origin: string]: OriginOverrides }

export type MessageType =
  | { type: 'GET_OVERRIDES'; origin: string }
  | { type: 'SET_OVERRIDE'; origin: string; key: string; override: Override }
  | { type: 'DELETE_OVERRIDE'; origin: string; key: string }
  | { type: 'CHECK_INTERCEPT'; method: string; url: string }

export type CheckInterceptResponse =
  | { matched: false }
  | { matched: true; override: Override; templatePath: string }

export type OpenAPISpec = {
  paths: Record<string, OpenAPIPathItem>
  components?: {
    schemas?: Record<string, OpenAPISchema>
  }
}

export type OpenAPIPathItem = Partial<
  Record<'get' | 'post' | 'put' | 'patch' | 'delete', OpenAPIOperation>
>

export type OpenAPIOperation = {
  tags?: string[]
  summary?: string
  operationId?: string
  responses?: Record<string, OpenAPIResponse>
}

export type OpenAPIResponse = {
  content?: Record<string, { schema?: OpenAPISchema }>
}

export type OpenAPISchema = {
  type?: string
  properties?: Record<string, OpenAPISchema>
  items?: OpenAPISchema
  $ref?: string
  enum?: unknown[]
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types"
```

---

### Task 3: Path matcher (TDD)

The path matcher takes an OpenAPI template like `/api/users/{id}` and a concrete URL like `https://example.com/api/users/123` and returns whether they match.

**Files:**
- Create: `src/lib/path-matcher.ts`
- Create: `test/path-matcher.test.ts`

**Step 1: Write the failing tests**

```ts
// test/path-matcher.test.ts
import { describe, it, expect } from 'vitest'
import { matchPath, extractPathFromUrl } from '../src/lib/path-matcher'

describe('extractPathFromUrl', () => {
  it('extracts pathname from a full URL', () => {
    expect(extractPathFromUrl('https://example.com/api/users/123?foo=bar'))
      .toBe('/api/users/123')
  })

  it('returns the input if it looks like a path already', () => {
    expect(extractPathFromUrl('/api/users/123')).toBe('/api/users/123')
  })
})

describe('matchPath', () => {
  it('matches an exact path', () => {
    expect(matchPath('/api/users', '/api/users')).toBe(true)
  })

  it('matches a path with a single template param', () => {
    expect(matchPath('/api/users/{id}', '/api/users/123')).toBe(true)
  })

  it('matches a path with multiple template params', () => {
    expect(matchPath('/api/orgs/{orgId}/users/{userId}', '/api/orgs/42/users/7')).toBe(true)
  })

  it('does not match different segment counts', () => {
    expect(matchPath('/api/users/{id}', '/api/users')).toBe(false)
  })

  it('does not match different static segments', () => {
    expect(matchPath('/api/users/{id}', '/api/posts/123')).toBe(false)
  })

  it('does not match a prefix', () => {
    expect(matchPath('/api/users', '/api/users/123')).toBe(false)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run test/path-matcher.test.ts
```
Expected: FAIL — `Cannot find module '../src/lib/path-matcher'`

**Step 3: Write the implementation**

```ts
// src/lib/path-matcher.ts

export function extractPathFromUrl(urlOrPath: string): string {
  try {
    return new URL(urlOrPath).pathname
  } catch {
    return urlOrPath
  }
}

export function matchPath(template: string, concretePath: string): boolean {
  const templateParts = template.split('/').filter(Boolean)
  const concreteParts = concretePath.split('/').filter(Boolean)

  if (templateParts.length !== concreteParts.length) return false

  return templateParts.every((part, i) =>
    part.startsWith('{') && part.endsWith('}')
      ? true
      : part === concreteParts[i]
  )
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run test/path-matcher.test.ts
```
Expected: all PASS

**Step 5: Commit**

```bash
git add src/lib/path-matcher.ts test/path-matcher.test.ts
git commit -m "feat: add path matcher with tests"
```

---

### Task 4: Body merger (TDD)

The body merger takes a real API response body and an `Override`, and returns the final response body.

**Files:**
- Create: `src/lib/body-merger.ts`
- Create: `test/body-merger.test.ts`

**Step 1: Write the failing tests**

```ts
// test/body-merger.test.ts
import { describe, it, expect } from 'vitest'
import { mergeBody } from '../src/lib/body-merger'
import type { Override } from '../src/types'

const baseOverride: Override = {
  enabled: true,
  statusCode: null,
  delayMs: null,
  bodyOverrides: {},
  rawBody: null,
}

describe('mergeBody', () => {
  it('returns the real body unchanged when no overrides', () => {
    const real = { id: '1', role: 'user' }
    expect(mergeBody(real, baseOverride)).toEqual({ id: '1', role: 'user' })
  })

  it('applies field-level overrides on top of real body', () => {
    const real = { id: '1', role: 'user', name: 'Alice' }
    const override = { ...baseOverride, bodyOverrides: { role: 'admin' } }
    expect(mergeBody(real, override)).toEqual({ id: '1', role: 'admin', name: 'Alice' })
  })

  it('rawBody takes precedence over everything when set', () => {
    const real = { id: '1', role: 'user' }
    const override = {
      ...baseOverride,
      bodyOverrides: { role: 'admin' },
      rawBody: '{"custom": true}',
    }
    expect(mergeBody(real, override)).toEqual({ custom: true })
  })

  it('handles a null real body gracefully', () => {
    const override = { ...baseOverride, bodyOverrides: { foo: 'bar' } }
    expect(mergeBody(null, override)).toEqual({ foo: 'bar' })
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run test/body-merger.test.ts
```
Expected: FAIL

**Step 3: Write the implementation**

```ts
// src/lib/body-merger.ts
import type { Override } from '../types'

export function mergeBody(
  realBody: unknown,
  override: Override
): unknown {
  if (override.rawBody !== null) {
    return JSON.parse(override.rawBody)
  }

  const base = typeof realBody === 'object' && realBody !== null ? realBody : {}
  return { ...base as object, ...override.bodyOverrides }
}
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run test/body-merger.test.ts
```
Expected: all PASS

**Step 5: Commit**

```bash
git add src/lib/body-merger.ts test/body-merger.test.ts
git commit -m "feat: add body merger with tests"
```

---

### Task 5: Schema parser (TDD)

Parses an OpenAPI spec and extracts a flat list of endpoints plus the response schema for each.

**Files:**
- Create: `src/lib/schema-parser.ts`
- Create: `test/schema-parser.test.ts`

**Step 1: Write the failing tests**

```ts
// test/schema-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseEndpoints, resolveSchema } from '../src/lib/schema-parser'
import type { OpenAPISpec } from '../src/types'

const spec: OpenAPISpec = {
  paths: {
    '/api/users': {
      get: { tags: ['Users'], summary: 'List users', responses: {} },
      post: { tags: ['Users'], summary: 'Create user', responses: {} },
    },
    '/api/users/{id}': {
      get: { tags: ['Users'], summary: 'Get user', responses: {} },
    },
    '/api/reports': {
      get: { tags: ['Reports'], summary: 'List reports', responses: {} },
    },
  },
}

describe('parseEndpoints', () => {
  it('extracts all method+path combinations', () => {
    const endpoints = parseEndpoints(spec)
    expect(endpoints.map(e => e.key)).toEqual(
      expect.arrayContaining([
        'GET /api/users',
        'POST /api/users',
        'GET /api/users/{id}',
        'GET /api/reports',
      ])
    )
    expect(endpoints).toHaveLength(4)
  })

  it('includes tag, summary, method and path', () => {
    const endpoints = parseEndpoints(spec)
    const getUsersById = endpoints.find(e => e.key === 'GET /api/users/{id}')
    expect(getUsersById).toMatchObject({
      key: 'GET /api/users/{id}',
      method: 'GET',
      path: '/api/users/{id}',
      tag: 'Users',
      summary: 'Get user',
    })
  })

  it('uses "Other" tag when none provided', () => {
    const noTagSpec: OpenAPISpec = {
      paths: { '/api/foo': { get: { responses: {} } } },
    }
    const endpoints = parseEndpoints(noTagSpec)
    expect(endpoints[0].tag).toBe('Other')
  })
})

describe('resolveSchema', () => {
  it('returns schema as-is when no $ref', () => {
    const schema = { type: 'object', properties: { id: { type: 'string' } } }
    expect(resolveSchema(schema, {})).toEqual(schema)
  })

  it('resolves a $ref to a component schema', () => {
    const schemas = { User: { type: 'object', properties: { id: { type: 'string' } } } }
    const schema = { $ref: '#/components/schemas/User' }
    expect(resolveSchema(schema, schemas)).toEqual(schemas.User)
  })

  it('returns undefined for an unknown $ref', () => {
    expect(resolveSchema({ $ref: '#/components/schemas/Missing' }, {})).toBeUndefined()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx vitest run test/schema-parser.test.ts
```
Expected: FAIL

**Step 3: Write the implementation**

```ts
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
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run test/schema-parser.test.ts
```
Expected: all PASS

**Step 5: Run all tests together**

```bash
npx vitest run
```
Expected: all PASS

**Step 6: Commit**

```bash
git add src/lib/schema-parser.ts test/schema-parser.test.ts
git commit -m "feat: add schema parser with tests"
```

---

### Task 6: Background service worker

Holds override state and handles messages from panel and content script.

**Files:**
- Create: `src/background/service-worker.ts`

**Step 1: Write the service worker**

```ts
// src/background/service-worker.ts
import type { MessageType, CheckInterceptResponse, OriginOverrides } from '../types'
import { matchPath, extractPathFromUrl } from '../lib/path-matcher'

// In-memory cache, backed by chrome.storage.local
const state: Record<string, OriginOverrides> = {}

async function loadOrigin(origin: string): Promise<OriginOverrides> {
  if (state[origin]) return state[origin]
  const stored = await chrome.storage.local.get(origin)
  state[origin] = (stored[origin] as OriginOverrides) ?? {}
  return state[origin]
}

async function saveOrigin(origin: string): Promise<void> {
  await chrome.storage.local.set({ [origin]: state[origin] })
}

chrome.runtime.onMessage.addListener((message: MessageType, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse)
  return true // keep message channel open for async response
})

async function handleMessage(message: MessageType): Promise<unknown> {
  switch (message.type) {
    case 'GET_OVERRIDES': {
      return loadOrigin(message.origin)
    }

    case 'SET_OVERRIDE': {
      const overrides = await loadOrigin(message.origin)
      overrides[message.key] = message.override
      await saveOrigin(message.origin)
      return { ok: true }
    }

    case 'DELETE_OVERRIDE': {
      const overrides = await loadOrigin(message.origin)
      delete overrides[message.key]
      await saveOrigin(message.origin)
      return { ok: true }
    }

    case 'CHECK_INTERCEPT': {
      const url = new URL(message.url)
      const origin = url.origin
      const path = extractPathFromUrl(message.url)
      const overrides = await loadOrigin(origin)

      for (const [key, override] of Object.entries(overrides)) {
        if (!override.enabled) continue
        const [keyMethod, ...keyPathParts] = key.split(' ')
        const keyPath = keyPathParts.join(' ')
        if (keyMethod !== message.method.toUpperCase()) continue
        if (!matchPath(keyPath, path)) continue

        return {
          matched: true,
          override,
          templatePath: keyPath,
        } satisfies CheckInterceptResponse
      }

      return { matched: false } satisfies CheckInterceptResponse
    }
  }
}
```

**Step 2: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat: add background service worker"
```

---

### Task 7: Content script + injected script

The content script injects code into the page. The injected script monkey-patches fetch/XHR.

**Files:**
- Create: `src/content/content-script.ts`
- Create: `src/injected/injected.ts`

**Step 1: Write the content script**

The content script's job: inject `injected.ts` into the page context, and bridge `window.postMessage` to `chrome.runtime.sendMessage`.

```ts
// src/content/content-script.ts

// Inject the script into the page context (required to patch window.fetch)
const script = document.createElement('script')
script.src = chrome.runtime.getURL('src/injected/injected.js')
script.type = 'module'
;(document.head || document.documentElement).appendChild(script)
script.remove()

// Bridge: page → background
window.addEventListener('message', (event) => {
  if (event.source !== window) return
  if (event.data?.source !== 'intercept-injected') return

  chrome.runtime.sendMessage(event.data.message, (response) => {
    window.postMessage(
      { source: 'intercept-content', id: event.data.id, response },
      '*'
    )
  })
})
```

**Step 2: Write the injected script**

This runs in the page context and patches `window.fetch`.

```ts
// src/injected/injected.ts

const pendingCallbacks = new Map<string, (response: unknown) => void>()

// Async bridge to background worker via content script
function sendToBackground(message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2)
    pendingCallbacks.set(id, resolve)
    window.postMessage({ source: 'intercept-injected', id, message }, '*')
  })
}

// Receive responses from content script
window.addEventListener('message', (event) => {
  if (event.data?.source !== 'intercept-content') return
  const cb = pendingCallbacks.get(event.data.id)
  if (cb) {
    pendingCallbacks.delete(event.data.id)
    cb(event.data.response)
  }
})

// Patch window.fetch
const originalFetch = window.fetch.bind(window)

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.href
    : input.url
  const method = (
    init?.method ??
    (typeof input === 'object' && 'method' in input ? input.method : undefined) ??
    'GET'
  ).toUpperCase()

  const result = await sendToBackground({ type: 'CHECK_INTERCEPT', method, url }) as {
    matched: boolean
    override?: {
      statusCode: number | null
      delayMs: number | null
      bodyOverrides: Record<string, unknown>
      rawBody: string | null
    }
  }

  if (!result.matched || !result.override) {
    return originalFetch(input, init)
  }

  const { override } = result

  // Fetch the real response to get the base body for field-level merging
  const realResponse = await originalFetch(input, init)
  let realBody: unknown = null
  try {
    realBody = await realResponse.clone().json()
  } catch {
    // Non-JSON response — skip body merging, use raw override only
  }

  // Compute final body
  let finalBody: unknown
  if (override.rawBody !== null) {
    finalBody = JSON.parse(override.rawBody)
  } else {
    finalBody = typeof realBody === 'object' && realBody !== null
      ? { ...realBody as object, ...override.bodyOverrides }
      : override.bodyOverrides
  }

  if (override.delayMs) {
    await new Promise((r) => setTimeout(r, override.delayMs!))
  }

  return new Response(JSON.stringify(finalBody), {
    status: override.statusCode ?? realResponse.status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

**Step 3: Commit**

```bash
git add src/content/content-script.ts src/injected/injected.ts
git commit -m "feat: add content script and fetch interceptor"
```

---

### Task 8: DevTools entry point

**Files:**
- Create: `src/devtools/devtools.html`
- Create: `src/devtools/devtools.ts`
- Create: `src/panel/index.html`
- Create: `src/panel/main.tsx`
- Create: `src/panel/App.tsx` (placeholder)

**Step 1: Write `src/devtools/devtools.html`**

```html
<!DOCTYPE html>
<html>
  <head><meta charset="utf-8" /></head>
  <body>
    <script type="module" src="./devtools.ts"></script>
  </body>
</html>
```

**Step 2: Write `src/devtools/devtools.ts`**

```ts
// src/devtools/devtools.ts
chrome.devtools.panels.create('Intercept', '', '../panel/index.html')
```

**Step 3: Write `src/panel/index.html`**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Intercept</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, sans-serif; font-size: 13px; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

**Step 4: Write `src/panel/main.tsx`**

```tsx
// src/panel/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

**Step 5: Write placeholder `src/panel/App.tsx`**

```tsx
// src/panel/App.tsx
export function App() {
  return <div style={{ padding: 16 }}>Intercept loading...</div>
}
```

**Step 6: Build and verify**

```bash
npx vite build
```
Expected: build succeeds.

**Step 7: Commit**

```bash
git add src/devtools/ src/panel/index.html src/panel/main.tsx src/panel/App.tsx
git commit -m "feat: add devtools panel entry point"
```

---

### Task 9: useOverrides hook

Loads overrides from the background worker and exposes setter/deleter for the panel.

The inspected tab's origin is retrieved via `chrome.tabs.get` (requires the `tabs` permission already in manifest).

**Files:**
- Create: `src/panel/hooks/useOverrides.ts`

**Step 1: Write the hook**

```ts
// src/panel/hooks/useOverrides.ts
import { useState, useEffect, useCallback } from 'react'
import type { Override, OriginOverrides } from '../../types'

async function getInspectedOrigin(): Promise<string> {
  return new Promise((resolve) => {
    const tabId = chrome.devtools.inspectedWindow.tabId
    chrome.tabs.get(tabId, (tab) => {
      try {
        resolve(new URL(tab.url ?? '').origin)
      } catch {
        resolve('unknown')
      }
    })
  })
}

export function useOverrides() {
  const [origin, setOrigin] = useState<string>('')
  const [overrides, setOverrides] = useState<OriginOverrides>({})

  const load = useCallback(async (o: string) => {
    const result = await chrome.runtime.sendMessage({ type: 'GET_OVERRIDES', origin: o })
    setOverrides(result ?? {})
  }, [])

  useEffect(() => {
    getInspectedOrigin().then((o) => {
      setOrigin(o)
      load(o)
    })
  }, [load])

  const setOverride = useCallback(async (key: string, override: Override) => {
    await chrome.runtime.sendMessage({ type: 'SET_OVERRIDE', origin, key, override })
    setOverrides((prev) => ({ ...prev, [key]: override }))
  }, [origin])

  const deleteOverride = useCallback(async (key: string) => {
    await chrome.runtime.sendMessage({ type: 'DELETE_OVERRIDE', origin, key })
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [origin])

  return { origin, overrides, setOverride, deleteOverride, reload: () => load(origin) }
}
```

**Step 2: Commit**

```bash
git add src/panel/hooks/useOverrides.ts
git commit -m "feat: add useOverrides hook"
```

---

### Task 10: EndpointList component

Left panel — searchable list of endpoints grouped by tag.

**Files:**
- Create: `src/panel/components/EndpointList.tsx`

**Step 1: Write the component**

```tsx
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
```

**Step 2: Commit**

```bash
git add src/panel/components/EndpointList.tsx
git commit -m "feat: add EndpointList component"
```

---

### Task 11: SchemaPreview component

Right panel — renders the OpenAPI response schema.

**Files:**
- Create: `src/panel/components/SchemaPreview.tsx`

**Step 1: Write the component**

```tsx
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
```

**Step 2: Commit**

```bash
git add src/panel/components/SchemaPreview.tsx
git commit -m "feat: add SchemaPreview component"
```

---

### Task 12: OverrideEditor component

Middle panel — status code, delay, form/JSON toggle, save/reset.

**Files:**
- Create: `src/panel/components/OverrideEditor.tsx`

**Step 1: Write the component**

```tsx
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
```

**Step 2: Commit**

```bash
git add src/panel/components/OverrideEditor.tsx
git commit -m "feat: add OverrideEditor component"
```

---

### Task 13: Wire up App.tsx

Brings everything together — loads spec, renders all three panels.

**Files:**
- Modify: `src/panel/App.tsx`

**Step 1: Replace placeholder with full App**

```tsx
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
```

**Step 2: Type check and build**

```bash
npx tsc --noEmit && npx vite build
```
Expected: no errors

**Step 3: Commit**

```bash
git add src/panel/App.tsx
git commit -m "feat: wire up App with all three panels"
```

---

### Task 14: Manual test harness

A simple page that hits a real public API, for manual extension testing.

**Files:**
- Create: `test-harness/index.html`
- Create: `test-harness/main.ts`

**Step 1: Write test harness**

```html
<!-- test-harness/index.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Intercept Test Harness</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; }
      pre { background: #f5f5f5; padding: 12px; border-radius: 6px; white-space: pre-wrap; }
      button { padding: 8px 16px; margin: 4px; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Intercept Test Harness</h1>
    <p>Open DevTools → Intercept tab, load a spec, set overrides, then click below.</p>
    <button id="fetch-btn">Fetch https://jsonplaceholder.typicode.com/users/1</button>
    <pre id="output">Click a button to fire a request.</pre>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

```ts
// test-harness/main.ts
document.getElementById('fetch-btn')!.addEventListener('click', async () => {
  const output = document.getElementById('output')!
  output.textContent = 'Loading...'
  try {
    const res = await fetch('https://jsonplaceholder.typicode.com/users/1')
    const json = await res.json()
    output.textContent = `Status: ${res.status}\n\n${JSON.stringify(json, null, 2)}`
  } catch (e) {
    output.textContent = `Error: ${(e as Error).message}`
  }
})
```

**Step 2: Serve and test**

```bash
npx vite test-harness --port 5173
```

Load the built extension from `dist/` in `chrome://extensions` → Load unpacked, then navigate to `http://localhost:5173`.

**Step 3: Commit**

```bash
git add test-harness/
git commit -m "chore: add manual test harness"
```

---

### Task 15: Final verification

**Step 1: Run all unit tests**

```bash
npx vitest run
```
Expected: all PASS

**Step 2: Type check**

```bash
npx tsc --noEmit
```
Expected: no errors

**Step 3: Production build**

```bash
npx vite build
```
Expected: `dist/` folder produced

**Step 4: Tag v0.1.0**

```bash
git tag v0.1.0
git log --oneline
```

---

## Manual Testing Checklist

Load extension from `dist/`, navigate to `http://localhost:5173`, open DevTools → Intercept:

- [ ] Panel appears in DevTools
- [ ] Paste Swagger URL → click Load → endpoints appear grouped by tag
- [ ] Select endpoint → schema fields appear in form
- [ ] Set field override → Save → click Fetch → response shows overridden field
- [ ] Set status code → Save → click Fetch → response has overridden status
- [ ] Set delay → Save → click Fetch → response is visibly delayed
- [ ] Switch to Raw JSON → enter `{"test": true}` → Save → Fetch → response is `{"test": true}`
- [ ] Reload page → overrides still present (persisted)
- [ ] Disable override → Fetch → real response returned
- [ ] Delete override → Fetch → real response returned
- [ ] Navigate to a different origin → overrides are scoped (not shared)

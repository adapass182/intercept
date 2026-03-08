# Intercept — Design Document
_2026-03-08_

## Overview

**intercept** is a Chrome DevTools extension that loads your OpenAPI spec and lets you override API responses in-browser — without touching the backend. Field-level editing, status code overrides, and response delays, all scoped per origin and persisted across reloads.

---

## Problem

When building against a Swagger-backed API, testing edge cases (empty lists, error states, permission variants) requires either backend setup or manually crafting mock responses. Existing tools like Requestly are generic — they require writing responses from scratch with no knowledge of your schema.

**intercept** solves this by reading your OpenAPI spec and generating the editing interface automatically.

---

## Architecture

Chrome Extension (Manifest V3) with three components:

- **DevTools Panel** — React + TypeScript + Vite. The main UI, runs in the DevTools context.
- **Injected Script** — injected into the page via content script. Monkey-patches `window.fetch` and `XMLHttpRequest` to intercept matching requests and return overrides.
- **Background Service Worker** — holds override state in memory, syncs with `chrome.storage.local`. Receives messages from both the panel and the injected script.

### Communication Flow

```
DevTools Panel
    ↕ chrome.runtime.sendMessage
Background Service Worker
    ↕ chrome.tabs.sendMessage → Content Script
                                    ↕ window.postMessage
                                Injected Script (in page)
```

---

## Data Model

Overrides are stored per origin in `chrome.storage.local`, keyed by `METHOD /path`:

```ts
type Override = {
  enabled: boolean
  statusCode: number | null       // null = use real status code
  delayMs: number | null          // null = no delay
  bodyOverrides: Record<string, unknown>  // field-level patches merged onto real response
  rawBody: string | null          // if set, replaces body entirely (takes precedence)
}

// Stored as:
// chrome.storage.local: { [origin: string]: { [key: string]: Override } }
// e.g. { "https://staging.coolset.com": { "GET /api/users/{id}": Override } }
```

---

## UI Layout

Three-panel DevTools interface:

```
┌─────────────────┬────────────────────────┬──────────────────┐
│  Endpoints      │  Override Editor        │  Schema Preview  │
│                 │                         │                  │
│ 🔴 GET /users   │  GET /users/{id}        │  User {          │
│ ✅ POST /orgs   │  ─────────────────────  │    id: string    │
│    GET /reports │  Status: [200 ▼]        │    role: string  │
│    ...          │  Delay:  [0ms    ]      │    ...           │
│                 │                         │  }               │
│                 │  ● Form  ○ Raw JSON     │                  │
│                 │  role: ["admin"   ]     │                  │
│                 │  name: ["Alice"   ]     │                  │
│                 │                         │                  │
│                 │  [Toggle Off] [Reset]   │                  │
└─────────────────┴────────────────────────┴──────────────────┘
```

- **Left panel** — searchable endpoint list grouped by OpenAPI tag. Red dot = active override.
- **Middle panel** — editor for the selected endpoint. Status code dropdown, delay input, form/JSON toggle.
- **Right panel** — OpenAPI response schema for reference while editing.

---

## Interception Mechanism

Chrome MV3 does not allow response body modification via `webRequest`. Instead:

1. Content script injects a `<script>` tag into the page that monkey-patches `window.fetch` and `XMLHttpRequest`
2. Before each request, the injected script checks with the background worker: "is there an active override for `GET /api/users/123`?"
3. Path matching maps OpenAPI path templates (e.g. `/api/users/{id}`) to concrete URLs using a simple segment-by-segment matcher
4. If a match is found and the override is enabled, a synthetic `Response` is returned with the patched body and status code — the real network request is never made
5. If `delayMs` is set, the synthetic response is returned after that delay

This approach only intercepts JS-initiated requests (fetch/XHR). Server-side and extension requests are unaffected — which is the correct behavior for this use case.

---

## OpenAPI Spec Loading

- Spec URL is configurable per origin in extension settings
- Fetched fresh on DevTools panel open, cached in memory for the session
- Supports OpenAPI 3.x (JSON format)

---

## Testing

MVP scope: unit tests only, using Vitest.

- Path matching logic (template → concrete URL)
- Body merging (field-level `bodyOverrides` merged onto a base response object)
- Schema parsing (extracting response shape from OpenAPI spec)

Manual testing via the included Vite dev app (hits a real public API).

---

## Tech Stack

| Layer | Choice |
|---|---|
| Extension framework | Chrome MV3 |
| UI | React + TypeScript |
| Build | Vite |
| Tests | Vitest |
| Storage | `chrome.storage.local` |
| Spec format | OpenAPI 3.x JSON |

---

## Out of Scope (MVP)

- Firefox support
- OpenAPI 2.x (Swagger 2)
- Response body streaming
- Request body overrides
- E2E browser automation tests
- Cloud sync of overrides

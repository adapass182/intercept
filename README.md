# intercept

> A Chrome DevTools extension for OpenAPI-aware API response overrides — without touching your backend.

![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Tests](https://img.shields.io/badge/tests-18%20passing-22c55e)
![License](https://img.shields.io/badge/license-MIT-a855f7)

---

## What it does

**Intercept** lets you mock any API response directly in the browser — no proxy, no code changes, no backend involvement.

Load your OpenAPI spec, pick an endpoint, and set overrides. Every `fetch` call to that endpoint returns your synthetic response instead of the real one — scoped to the current origin, persisted across page reloads.

---

## Features

- **OpenAPI-driven** — paste a spec URL and every endpoint appears instantly, grouped by tag
- **Schema-aware form editing** — response fields are extracted from the spec and rendered as inputs; no JSON required
- **Raw JSON mode** — bypass the form and return any body you want
- **Status code & delay overrides** — simulate errors and slow networks in one click
- **Per-origin persistence** — overrides are saved to `chrome.storage.local` and scoped to each site separately
- **Enable / disable without losing config** — toggle overrides on and off without deleting them
- **Zero backend changes** — monkey-patches `window.fetch` at the page level; the server never knows

---

## How it works

```
DevTools Panel  ──────────────────────────────────────────────────────────┐
  (React UI)                                                               │
      │  chrome.runtime.sendMessage                                        │
      ▼                                                                    │
Background Service Worker  ◄──────────────────────────────────────────────┘
  (override state + chrome.storage.local)
      ▲
      │  window.postMessage bridge
      │
Content Script  (runs in page context, relays messages)
      │
      ▼
Injected Script  (patches window.fetch / XHR before any app code runs)
```

When a page makes a `fetch` call:

1. The injected script intercepts it and asks the background worker if an override exists
2. If matched: the real request still fires, the real body is fetched, then field-level patches are applied on top (or a raw body is returned wholesale)
3. The synthetic `Response` is returned to the page — completely transparent to the app

---

## Getting started

### Install from source

```bash
git clone https://github.com/adapass182/intercept.git
cd intercept
npm install
npm run build
```

Then in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

### Usage

1. Open DevTools on any page
2. Click the **Intercept** tab
3. Paste your OpenAPI spec URL → **Load**
4. Select an endpoint from the left panel
5. Set overrides (status code, delay, body fields) → **Save**
6. Fire a request — the page receives your overridden response

---

## Tech stack

| Layer | Tech |
|---|---|
| Extension runtime | Chrome MV3 |
| Build | Vite + `@crxjs/vite-plugin` |
| UI | React 18 + TypeScript (strict) |
| State | `chrome.storage.local` |
| Tests | Vitest |

---

## Project structure

```
src/
├── types.ts                      # shared types across all layers
├── background/
│   └── service-worker.ts         # override state + message handler
├── content/
│   └── content-script.ts         # injects script, bridges messages
├── injected/
│   └── injected.ts               # monkey-patches window.fetch
├── devtools/
│   ├── devtools.html             # devtools entry point
│   └── devtools.ts               # registers the panel
├── panel/
│   ├── App.tsx                   # root component
│   ├── components/
│   │   ├── EndpointList.tsx      # searchable endpoint sidebar
│   │   ├── OverrideEditor.tsx    # form + raw JSON editor
│   │   └── SchemaPreview.tsx     # live schema renderer
│   └── hooks/
│       └── useOverrides.ts       # override state + chrome messaging
└── lib/
    ├── path-matcher.ts           # OpenAPI template → URL matching
    ├── body-merger.ts            # field-level patch logic
    └── schema-parser.ts          # spec → endpoint + schema extraction
```

---

## Development

```bash
npm run build      # production build → dist/
npm test           # run unit tests (vitest)
npm run typecheck  # strict TypeScript check
```

To iterate with live reload, serve the test harness:

```bash
npx vite test-harness --port 5173
```

Then reload the unpacked extension in `chrome://extensions` after each build.

---

## License

MIT

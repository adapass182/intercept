// src/background/service-worker.ts
import type { MessageType, CheckInterceptResponse, OriginOverrides } from '../types'
import { matchPath, extractPathFromUrl } from '../lib/path-matcher'

// In-memory cache, backed by chrome.storage.local
const state: Record<string, OriginOverrides> = {}

// Last real response body per endpoint key — persisted so it survives SW restarts
const realResponses: Record<string, unknown> = {}

// Watched patterns and basePaths are persisted to survive SW restarts
const watchedPatterns: Array<{ method: string; path: string; key: string }> = []
const basePaths: Record<string, string> = {}

// Rolling debug log (last 100 entries)
const debugLog: string[] = []
function log(msg: string) {
  const entry = `${new Date().toISOString().slice(11, 23)} ${msg}`
  debugLog.push(entry)
  if (debugLog.length > 100) debugLog.shift()
}

// Load persisted state on startup (runs every time SW wakes up)
async function init() {
  const stored = await chrome.storage.local.get(['_basePaths', '_watchedKeys', '_realResponses'])

  if (stored._basePaths) Object.assign(basePaths, stored._basePaths)
  if (stored._realResponses) Object.assign(realResponses, stored._realResponses)

  if (stored._watchedKeys) {
    for (const key of stored._watchedKeys as string[]) {
      if (watchedPatterns.find((p) => p.key === key)) continue
      const spaceIdx = key.indexOf(' ')
      const method = key.slice(0, spaceIdx)
      const path = key.slice(spaceIdx + 1)
      watchedPatterns.push({ method, path, key })
    }
  }

  log(`SW init — basePaths: ${JSON.stringify(basePaths)} watched: ${watchedPatterns.map(p => p.key).join(', ') || 'none'}`)
}

init()

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
      const rawPath = extractPathFromUrl(message.url)
      const base = basePaths[origin] ?? ''
      const path = base && rawPath.startsWith(base) ? rawPath.slice(base.length) || '/' : rawPath

      log(`CHECK_INTERCEPT ${message.method} ${rawPath} → stripped: ${path} (base: "${base}") watched: [${watchedPatterns.map(p => p.key).join(', ')}]`)

      const overrides = await loadOrigin(origin)

      for (const [key, override] of Object.entries(overrides)) {
        if (!override.enabled) continue
        const spaceIdx = key.indexOf(' ')
        const keyMethod = key.slice(0, spaceIdx)
        const keyPath = key.slice(spaceIdx + 1)
        if (keyMethod !== message.method.toUpperCase()) continue
        if (!matchPath(keyPath, path)) continue

        log(`→ OVERRIDE MATCH: ${key}`)
        return {
          matched: true,
          override,
          templatePath: keyPath,
        } satisfies CheckInterceptResponse
      }

      // No override matched — check watched patterns for capture
      for (const watched of watchedPatterns) {
        if (watched.method !== message.method.toUpperCase()) continue
        if (!matchPath(watched.path, path)) continue
        log(`→ WATCH MATCH: ${watched.key} (will capture)`)
        return { matched: false, captureKey: watched.key } satisfies CheckInterceptResponse
      }

      log(`→ no match`)
      return { matched: false } satisfies CheckInterceptResponse
    }

    case 'SET_BASE_PATH': {
      basePaths[message.origin] = message.basePath
      await chrome.storage.local.set({ _basePaths: basePaths })
      log(`SET_BASE_PATH ${message.origin} → "${message.basePath}"`)
      return { ok: true }
    }

    case 'WATCH_ENDPOINT': {
      const key = `${message.method.toUpperCase()} ${message.path}`
      if (!watchedPatterns.find((p) => p.key === key)) {
        watchedPatterns.push({ method: message.method.toUpperCase(), path: message.path, key })
        await chrome.storage.local.set({ _watchedKeys: watchedPatterns.map((p) => p.key) })
      }
      log(`WATCH_ENDPOINT ${key} — all watched: [${watchedPatterns.map(p => p.key).join(', ')}]`)
      return { ok: true }
    }

    case 'STORE_REAL_RESPONSE': {
      realResponses[message.key] = message.body
      await chrome.storage.local.set({ _realResponses: realResponses })
      log(`STORE_REAL_RESPONSE ${message.key}`)
      return { ok: true }
    }

    case 'GET_REAL_RESPONSE': {
      const resp = realResponses[message.key] ?? null
      log(`GET_REAL_RESPONSE ${message.key} → ${resp ? 'found' : 'not found'}`)
      return resp
    }

    case 'GET_DEBUG_LOG': {
      return [...debugLog]
    }
  }
}

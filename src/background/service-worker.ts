// src/background/service-worker.ts
import type { MessageType, CheckInterceptResponse, OriginOverrides } from '../types'
import { matchPath, extractPathFromUrl } from '../lib/path-matcher'

// In-memory cache, backed by chrome.storage.local
const state: Record<string, OriginOverrides> = {}

// Last real response body per endpoint key, e.g. "GET /api/users"
const realResponses: Record<string, unknown> = {}

// Endpoints the panel is currently watching (for response capture without an override)
const watchedPatterns: Array<{ method: string; path: string; key: string }> = []

// Swagger 2.0 basePath per origin (e.g. "/api"), stripped before path matching
const basePaths: Record<string, string> = {}

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

      // No override matched — check if the panel is watching this URL for capture
      for (const watched of watchedPatterns) {
        if (watched.method !== message.method.toUpperCase()) continue
        if (!matchPath(watched.path, path)) continue
        return { matched: false, captureKey: watched.key } satisfies CheckInterceptResponse
      }

      return { matched: false } satisfies CheckInterceptResponse
    }

    case 'SET_BASE_PATH': {
      basePaths[message.origin] = message.basePath
      return { ok: true }
    }

    case 'WATCH_ENDPOINT': {
      const key = `${message.method.toUpperCase()} ${message.path}`
      if (!watchedPatterns.find((p) => p.key === key)) {
        watchedPatterns.push({ method: message.method.toUpperCase(), path: message.path, key })
      }
      return { ok: true }
    }

    case 'STORE_REAL_RESPONSE': {
      realResponses[message.key] = message.body
      return { ok: true }
    }

    case 'GET_REAL_RESPONSE': {
      return realResponses[message.key] ?? null
    }
  }
}

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

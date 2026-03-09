// src/panel/hooks/useOverrides.ts
import { useState, useEffect, useCallback } from 'react'
import type { Override, OriginOverrides } from '../../types'
import { sendMessage } from '../lib/messaging'

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
    const result = await sendMessage<OriginOverrides>({ type: 'GET_OVERRIDES', origin: o })
    setOverrides(result ?? {})
  }, [])

  useEffect(() => {
    getInspectedOrigin().then((o) => {
      setOrigin(o)
      load(o)
    })
  }, [load])

  const setOverride = useCallback(async (key: string, override: Override) => {
    await sendMessage({ type: 'SET_OVERRIDE', origin, key, override })
    setOverrides((prev) => ({ ...prev, [key]: override }))
  }, [origin])

  const deleteOverride = useCallback(async (key: string) => {
    await sendMessage({ type: 'DELETE_OVERRIDE', origin, key })
    setOverrides((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [origin])

  return { origin, overrides, setOverride, deleteOverride, reload: () => load(origin) }
}

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

// src/panel/lib/messaging.ts
// Wraps chrome.runtime.sendMessage so that "Extension context invalidated"
// errors (which occur when the extension is reloaded while the DevTools panel
// stays open) are swallowed rather than thrown.

export function sendMessage<T = unknown>(message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Swallow — context invalidated or SW not ready
          resolve(null)
          return
        }
        resolve(response as T)
      })
    } catch {
      resolve(null)
    }
  })
}

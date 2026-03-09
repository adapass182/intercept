// src/content/content-script.ts

// Inject the script into the page context (required to patch window.fetch)
const script = document.createElement('script')
script.src = chrome.runtime.getURL('src/injected/injected.ts')
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

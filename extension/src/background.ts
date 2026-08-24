import { heartbeat, pairExtension } from './bridgeClient'


chrome.runtime.onMessage.addListener((message: { type?: string; code?: string }, _sender, sendResponse) => {
  if (message.type === 'pair' && message.code) {
    void pairExtension(message.code).then(() => sendResponse({ ok: true })).catch((error: Error) => sendResponse({ ok: false, error: error.message }))
    return true
  }
  return false
})

chrome.alarms?.create?.('bridge-heartbeat', { periodInMinutes: 0.4 })
void heartbeat('ready').catch(() => undefined)

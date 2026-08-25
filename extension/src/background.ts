import { fetchNextTask, heartbeat, pairExtension, updateTask, uploadTaskImage } from './bridgeClient'
import { sendTaskMessage } from './taskExecutor'
import type { BridgeErrorCode, GenerationTask } from './shared/protocol'


let running = false


async function waitForTab(tabId: number): Promise<void> {
  const current = await chrome.tabs.get(tabId)
  if (current.status === 'complete') return
  await new Promise<void>((resolve) => {
    const listener = (updatedId: number, info: chrome.tabs.TabChangeInfo) => {
      if (updatedId === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
}


async function ensureChatTab(): Promise<chrome.tabs.Tab> {
  const [existing] = await chrome.tabs.query({ url: 'https://chatgpt.com/*' })
  const tab = existing ?? await chrome.tabs.create({ url: 'https://chatgpt.com/', active: true })
  if (tab.id === undefined) throw new Error('PAGE_UNSUPPORTED')
  await chrome.tabs.update(tab.id, { active: true })
  if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true })
  await waitForTab(tab.id)
  return tab
}


async function executeVisibleTask(task: GenerationTask): Promise<void> {
  let stage: 'connecting' | 'sending' | 'generating' | 'downloading' = 'connecting'
  try {
    const tab = await ensureChatTab()
    stage = 'sending'
    await updateTask(task.id, stage, '正在发送 Prompt', undefined, tab.url)
    stage = 'generating'
    await updateTask(task.id, stage, 'ChatGPT 正在生成图片', undefined, tab.url)
    const result = await sendTaskMessage<{
      ok: boolean
      bytes?: ArrayBuffer
      mimeType?: string
      chatUrl?: string
      code?: BridgeErrorCode
      error?: string
    }>(chrome.tabs, tab.id!, { type: 'execute-task', task }, () => waitForTab(tab.id!))
    const typedResult = result as {
      ok: boolean
      bytes?: ArrayBuffer
      mimeType?: string
      chatUrl?: string
      code?: BridgeErrorCode
      error?: string
    }
    if (!typedResult.ok || !typedResult.bytes) throw Object.assign(new Error(typedResult.error ?? '任务执行失败'), { code: typedResult.code ?? 'PAGE_UNSUPPORTED' })
    stage = 'downloading'
    await updateTask(task.id, stage, '正在保存图片', undefined, typedResult.chatUrl)
    await uploadTaskImage(task.id, new Blob([typedResult.bytes], { type: typedResult.mimeType ?? 'image/png' }), typedResult.chatUrl ?? tab.url ?? 'https://chatgpt.com/')
  } catch (error) {
    const typed = error as Error & { code?: BridgeErrorCode }
    await updateTask(task.id, 'failed', typed.message || '任务执行失败', typed.code ?? 'PAGE_UNSUPPORTED').catch(() => undefined)
  }
}


async function poll(): Promise<void> {
  if (running) return
  running = true
  try {
    await heartbeat('ready')
    const task = await fetchNextTask()
    if (task) await executeVisibleTask(task)
  } catch {
    // Unpaired or temporarily offline: the next alarm retries the local connection only.
  } finally {
    running = false
  }
}


chrome.runtime.onMessage.addListener((message: { type?: string; code?: string }, _sender, sendResponse) => {
  if (message.type === 'pair' && message.code) {
    void pairExtension(message.code).then(() => { void poll(); sendResponse({ ok: true }) }).catch((error: Error) => sendResponse({ ok: false, error: error.message }))
    return true
  }
  return false
})

chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('bridge-poll', { periodInMinutes: 0.25 }))
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === 'bridge-poll') void poll() })
chrome.alarms.create('bridge-poll', { periodInMinutes: 0.25 })
void poll()

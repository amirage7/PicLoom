import type { GenerationStatus, GenerationTask } from './shared/protocol'


const API_BASE = 'http://127.0.0.1:8001/api'


export class BridgeClientError extends Error {}


async function token(): Promise<string> {
  const stored = await chrome.storage.local.get('bridgeToken') as { bridgeToken?: string }
  if (!stored.bridgeToken) throw new BridgeClientError('扩展尚未配对')
  return stored.bridgeToken
}


async function authenticated(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${await token()}` },
  })
  if (!response.ok) throw new BridgeClientError(`本地桥接请求失败 (${response.status})`)
  return response
}


export async function pairExtension(code: string): Promise<void> {
  const response = await fetch(`${API_BASE}/extension/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, extension_version: chrome.runtime.getManifest().version }),
  })
  if (!response.ok) throw new BridgeClientError('配对码无效或已过期')
  const body = await response.json() as { token: string }
  await chrome.storage.local.set({ bridgeToken: body.token })
}


export async function fetchNextTask(): Promise<GenerationTask | null> {
  const response = await authenticated('/extension/tasks/next')
  return response.json() as Promise<GenerationTask | null>
}


export async function heartbeat(state: string, chatUrl?: string): Promise<void> {
  await authenticated('/extension/heartbeat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, chat_url: chatUrl ?? null }),
  })
}


export async function updateTask(taskId: string, status: GenerationStatus, progressMessage: string, errorCode?: string, chatUrl?: string): Promise<void> {
  await authenticated(`/extension/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, progress_message: progressMessage, error_code: errorCode ?? null, chat_url: chatUrl ?? null }),
  })
}


export async function uploadTaskImage(taskId: string, image: Blob, chatUrl: string): Promise<void> {
  const body = new FormData()
  body.append('file', image, 'chatgpt-result.png')
  body.append('chat_url', chatUrl)
  await authenticated(`/extension/tasks/${taskId}/image`, { method: 'POST', body })
}

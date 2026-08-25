import type { GenerationStatus } from './types'
import { localBackendUrl } from '../../lib/localBackend'

export interface TaskDto { id: string; project_id: string; provider: string; prompt: string; parent_image_id: string | null; status: GenerationStatus; progress_message: string; chat_url: string | null; image_id: string | null; image_ids_json?: string; provider_mode?: string; error_code: string | null }
export interface StatusDto { paired: boolean; online: boolean; state: string; chat_url: string | null; extension_version: string | null }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(localBackendUrl(path), { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: string }
    throw new Error(body.detail ?? `请求失败 (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export const getProviderStatus = () => request<StatusDto>('/api/providers/chatgpt/status')
export const createPairingCode = () => request<{ code: string; expires_in_seconds: number }>('/api/providers/chatgpt/pairing', { method: 'POST' })
export const createGenerationTask = (projectId: string, prompt: string, parentImageId?: string) => request<TaskDto>('/api/generation-tasks', { method: 'POST', body: JSON.stringify({ project_id: projectId, prompt, parent_image_id: parentImageId ?? null }) })
export const getGenerationTask = (id: string) => request<TaskDto>(`/api/generation-tasks/${id}`)
export const cancelGenerationTask = (id: string) => request<TaskDto>(`/api/generation-tasks/${id}/cancel`, { method: 'POST' })

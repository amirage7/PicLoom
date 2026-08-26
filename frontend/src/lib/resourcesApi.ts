import { localBackendUrl } from './localBackend'

export interface ProjectDto { id: string; name: string; created_time: string; image_count: number }
export interface PromptDto { id: string; title: string; content: string; category: string; created_time: string }
export interface ImageDto {
  id: string
  project_id: string | null
  image_path: string
  image_url: string
  file_name: string
  name: string
  prompt: string
  tags: string[]
  parent_id: string | null
  source_ids: string[]
  position_x: number
  position_y: number
  created_time: string
  is_on_canvas?: boolean
  is_favorite?: boolean
  source_type?: 'generated' | 'uploaded'
}

function normalizeImage(value: ImageDto): ImageDto {
  return {
    ...value,
    image_url: value.image_url.startsWith('/') ? localBackendUrl(value.image_url) : value.image_url,
    is_on_canvas: value.is_on_canvas ?? true,
    is_favorite: value.is_favorite ?? false,
    source_type: value.source_type ?? 'uploaded',
  }
}

export interface ImagePatch {
  project_id?: string | null
  name?: string
  prompt?: string
  tags?: string[]
  parent_id?: string | null
  position_x?: number
  position_y?: number
  is_on_canvas?: boolean
  is_favorite?: boolean
}

export interface ImageRelationDto { id: string; source_id: string; target_id: string; relation_type: string; created_time: string }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  const response = await fetch(localBackendUrl(path), { ...init, headers })
  if (!response.ok) {
    let message = `请求失败 (${response.status})`
    try { const body = await response.json() as { detail?: string }; if (body.detail) message = body.detail } catch { /* status fallback */ }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

const json = (value: unknown) => JSON.stringify(value)

export const listProjects = () => request<ProjectDto[]>('/api/projects')
export const createProject = (name: string) => request<ProjectDto>('/api/projects', { method: 'POST', body: json({ name }) })
export const renameProject = (id: string, name: string) => request<ProjectDto>(`/api/projects/${id}`, { method: 'PATCH', body: json({ name }) })
export const deleteProject = (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' })
export const listPrompts = () => request<PromptDto[]>('/api/prompts')
export const createPrompt = (value: Pick<PromptDto, 'title' | 'content' | 'category'>) => request<PromptDto>('/api/prompts', { method: 'POST', body: json(value) })
export const updatePrompt = (id: string, value: Partial<Pick<PromptDto, 'title' | 'content' | 'category'>>) => request<PromptDto>(`/api/prompts/${id}`, { method: 'PATCH', body: json(value) })
export const duplicatePrompt = (id: string) => request<PromptDto>(`/api/prompts/${id}/duplicate`, { method: 'POST' })
export const deletePrompt = (id: string) => request<void>(`/api/prompts/${id}`, { method: 'DELETE' })
export const listImages = (projectId: string) => request<ImageDto[]>(`/api/projects/${projectId}/images`).then((values) => values.map(normalizeImage))
export const listUnarchivedImages = () => request<ImageDto[]>('/api/unarchived/images').then((values) => values.map(normalizeImage))

export function uploadImage(projectId: string, file: File, value: { prompt: string; positionX: number; positionY: number; parentId?: string | null }) {
  const body = new FormData()
  body.append('file', file); body.append('prompt', value.prompt); body.append('position_x', String(value.positionX)); body.append('position_y', String(value.positionY))
  if (value.parentId) body.append('parent_id', value.parentId)
  return request<ImageDto>(`/api/projects/${projectId}/images`, { method: 'POST', body }).then(normalizeImage)
}

export function uploadUnarchivedImage(file: File, prompt = '') {
  const body = new FormData(); body.append('file', file); body.append('prompt', prompt)
  return request<ImageDto>('/api/unarchived/images', { method: 'POST', body }).then(normalizeImage)
}

export const patchImage = (id: string, value: ImagePatch) => request<ImageDto>(`/api/images/${id}`, { method: 'PATCH', body: json(value) }).then(normalizeImage)
export const duplicateImage = (id: string) => request<ImageDto>(`/api/images/${id}/duplicate`, { method: 'POST' }).then(normalizeImage)
export const deleteImage = (id: string) => request<void>(`/api/images/${id}`, { method: 'DELETE' })
export const createImageRelation = (sourceId: string, targetId: string) => request<ImageRelationDto>('/api/image-relations', { method: 'POST', body: json({ source_id: sourceId, target_id: targetId }) })
export const deleteImageRelation = (sourceId: string, targetId: string) => request<void>(`/api/image-relations/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}`, { method: 'DELETE' })

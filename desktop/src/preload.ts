import { contextBridge, ipcRenderer } from 'electron'

import type {
  DesktopBridgeApi,
  DesktopGenerationEvent,
  DesktopGenerationState,
} from './contracts.js'

const GENERATION_STATES: ReadonlySet<DesktopGenerationState> = new Set([
  'queued',
  'opening_chatgpt',
  'login_required',
  'ready',
  'sending',
  'generating',
  'collecting',
  'importing',
  'completed',
  'refused',
  'rate_limited',
  'page_changed',
  'failed',
  'cancelled',
])

function isGenerationEvent(value: unknown): value is DesktopGenerationEvent {
  if (typeof value !== 'object' || value === null) return false
  const event = value as Partial<DesktopGenerationEvent>
  return (
    typeof event.taskId === 'string'
    && typeof event.state === 'string'
    && GENERATION_STATES.has(event.state as DesktopGenerationState)
    && typeof event.message === 'string'
    && Array.isArray(event.imageIds)
    && event.imageIds.every((id) => typeof id === 'string')
    && typeof event.recoverable === 'boolean'
  )
}

const api: DesktopBridgeApi = {
  getRuntimeStatus: () => ipcRenderer.invoke('desktop:get-runtime-status'),
  setChatGptView: (input) => ipcRenderer.invoke('desktop:set-chatgpt-view', input),
  startGeneration: (request) => ipcRenderer.invoke('desktop:start-generation', request),
  cancelGeneration: (taskId) => ipcRenderer.invoke('desktop:cancel-generation', taskId),
  retryCollection: (taskId) => ipcRenderer.invoke('desktop:retry-collection', taskId),
  onGenerationEvent: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isGenerationEvent(payload)) listener(payload)
    }
    ipcRenderer.on('desktop:generation-event', handler)
    return () => ipcRenderer.removeListener('desktop:generation-event', handler)
  },
}

contextBridge.exposeInMainWorld('aiImageCanvasDesktop', api)

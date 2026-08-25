import type {
  DesktopBridgeApi,
  DesktopGenerationEvent,
  DesktopGenerationState,
} from './contracts.js'
import { IPC_CHANNELS } from './ipc.js'

interface IpcRendererLike {
  invoke(channel: string, input?: unknown): Promise<unknown>
  on(channel: string, handler: (event: unknown, payload: unknown) => void): void
  removeListener(channel: string, handler: (event: unknown, payload: unknown) => void): void
}

const GENERATION_STATES: ReadonlySet<DesktopGenerationState> = new Set([
  'queued', 'opening_chatgpt', 'login_required', 'ready', 'sending', 'generating',
  'collecting', 'importing', 'completed', 'refused', 'rate_limited', 'page_changed',
  'failed', 'cancelled',
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

export function createDesktopBridge(ipcRenderer: IpcRendererLike): DesktopBridgeApi {
  return {
    getRuntimeStatus: () => ipcRenderer.invoke(IPC_CHANNELS.runtimeStatus) as ReturnType<DesktopBridgeApi['getRuntimeStatus']>,
    setChatGptView: (input) => ipcRenderer.invoke(IPC_CHANNELS.setChatGptView, input) as Promise<void>,
    reloadChatGpt: () => ipcRenderer.invoke(IPC_CHANNELS.reloadChatGpt) as Promise<void>,
    startGeneration: (request) => ipcRenderer.invoke(IPC_CHANNELS.startGeneration, request) as Promise<void>,
    cancelGeneration: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.cancelGeneration, taskId) as Promise<void>,
    retryCollection: (taskId) => ipcRenderer.invoke(IPC_CHANNELS.retryCollection, taskId) as Promise<void>,
    onGenerationEvent(listener) {
      const handler = (_event: unknown, payload: unknown) => {
        if (isGenerationEvent(payload)) listener(payload)
      }
      let subscribed = true
      ipcRenderer.on('desktop:generation-event', handler)
      void Promise.resolve(ipcRenderer.invoke(IPC_CHANNELS.lastGenerationEvent)).then((event) => {
        if (subscribed && isGenerationEvent(event)) listener(event)
      }).catch(() => {
        // The live subscription remains available if recovery lookup fails.
      })
      return () => {
        if (!subscribed) return
        subscribed = false
        ipcRenderer.removeListener('desktop:generation-event', handler)
      }
    },
  }
}

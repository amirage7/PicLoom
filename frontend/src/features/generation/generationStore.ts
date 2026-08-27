import { create } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand/vanilla'

import { getDesktopBridge } from '../desktop/desktopBridge'
import { ChatGptDesktopProvider } from './providers/ChatGptDesktopProvider'
import { chatGptImageProvider } from './chatGptProvider'
import type { ImageGenerationTask, ImageProvider, ProviderAvailability } from './types'
import type { DesktopBridgeApi, DesktopGenerationEvent, DesktopReferenceImage } from '../desktop/types'
import { useAppStore } from '../../app/store'

const terminal = new Set(['completed', 'failed', 'cancelled', 'refused', 'rate_limited', 'page_changed'])
const desktopTerminal = new Set(['completed', 'failed', 'cancelled', 'refused', 'rate_limited', 'page_changed'])
const recoverableDesktopTerminal = new Set(['failed', 'rate_limited', 'page_changed'])
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let quickActionToken = 0

export interface QuickGenerationAction {
  token: number
  projectId: string
  prompt: string
  referenceImages: DesktopReferenceImage[]
  transparentBackground: boolean
}

export type QuickGenerationActionInput = Omit<QuickGenerationAction, 'token'>

export interface GenerationState {
  prompt: string
  transparentBackground: boolean
  availability: ProviderAvailability | null
  task: ImageGenerationTask | null
  error: string | null
  isPanelOpen: boolean
  imageIds: string[]
  recoverable: boolean
  providerMode: string
  quickAction: QuickGenerationAction | null
  desktopBusy: boolean
  desktopTaskId: string | null
  desktopTaskProjectId: string | null
  desktopRecoverableTaskId: string | null
  desktopEvent: DesktopGenerationEvent | null
  setPrompt(value: string): void
  setTransparentBackground(value: boolean): void
  setPanelOpen(value: boolean): void
  enqueueQuickAction(action: QuickGenerationActionInput): void
  consumeQuickAction(projectId: string): QuickGenerationAction | null
  acquireDesktopGeneration(): boolean
  bindDesktopTask(taskId: string, projectId: string | null): void
  releaseDesktopGeneration(taskId?: string): void
  handleDesktopGenerationEvent(event: DesktopGenerationEvent): void
  refreshAvailability(): Promise<void>
  generate(projectId: string, prompt: string): Promise<ImageGenerationTask | null>
  cancel(): Promise<void>
}

const initializer = (provider: ImageProvider): StateCreator<GenerationState> => (set, get) => ({
  prompt: '', transparentBackground: false, availability: null, task: null, error: null, isPanelOpen: false, imageIds: [], recoverable: false, providerMode: provider.id, quickAction: null,
  desktopBusy: false, desktopTaskId: null, desktopTaskProjectId: null, desktopRecoverableTaskId: null, desktopEvent: null,
  setPrompt: (prompt) => set({ prompt }),
  setTransparentBackground: (transparentBackground) => set({ transparentBackground }),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  enqueueQuickAction: (action) => set({
    prompt: action.prompt,
    transparentBackground: action.transparentBackground,
    isPanelOpen: true,
    quickAction: { ...action, token: ++quickActionToken },
  }),
  consumeQuickAction: (projectId) => {
    const action = get().quickAction
    if (!action || action.projectId !== projectId) return null
    set({ quickAction: null })
    return action
  },
  acquireDesktopGeneration: () => {
    if (get().desktopBusy) return false
    set({
      desktopBusy: true,
      desktopTaskId: null,
      desktopTaskProjectId: null,
      desktopRecoverableTaskId: null,
      desktopEvent: null,
    })
    return true
  },
  bindDesktopTask: (desktopTaskId, desktopTaskProjectId) => set({
    desktopBusy: true,
    desktopTaskId,
    desktopTaskProjectId,
    desktopRecoverableTaskId: null,
  }),
  releaseDesktopGeneration: (taskId) => {
    const activeTaskId = get().desktopTaskId ?? get().desktopRecoverableTaskId
    if (taskId && activeTaskId && taskId !== activeTaskId) return
    set({ desktopBusy: false, desktopTaskId: null, desktopTaskProjectId: null, desktopRecoverableTaskId: null })
  },
  handleDesktopGenerationEvent: (desktopEvent) => {
    const state = get()
    const activeTaskId = state.desktopTaskId ?? state.desktopRecoverableTaskId
    if ((state.desktopBusy && !activeTaskId) || (activeTaskId && activeTaskId !== desktopEvent.taskId)) {
      return
    }
    const isTerminal = desktopTerminal.has(desktopEvent.state)
    const isRecoverable = isTerminal && desktopEvent.recoverable && recoverableDesktopTerminal.has(desktopEvent.state)
    set({
      desktopEvent,
      desktopBusy: !isTerminal,
      desktopTaskId: isTerminal ? (isRecoverable ? desktopEvent.taskId : null) : desktopEvent.taskId,
      desktopRecoverableTaskId: isRecoverable ? desktopEvent.taskId : null,
    })
    if (desktopEvent.state === 'completed') {
      void useAppStore.getState().hydrateResources().catch(() => undefined)
    }
  },
  refreshAvailability: async () => { try { set({ availability: await provider.getAvailability(), error: null }) } catch (error) { set({ error: error instanceof Error ? error.message : '连接失败' }) } },
  generate: async (projectId, prompt) => {
    set({ prompt, error: null, task: null, imageIds: [], recoverable: false })
    try {
      let task = await provider.generate({ projectId, prompt })
      set({ task, imageIds: task.imageIds, recoverable: task.recoverable })
      while (!terminal.has(task.status)) { await delay(1500); task = await provider.getTask(task.id); set({ task, imageIds: task.imageIds, recoverable: task.recoverable }) }
      if (task.status === 'failed') set({ error: task.progressMessage })
      return task
    } catch (error) { set({ error: error instanceof Error ? error.message : '生成失败' }); return null }
  },
  cancel: async () => { const task = get().task; if (task && !terminal.has(task.status)) await provider.cancel(task.id) },
})

export const createGenerationStore = (provider: ImageProvider) => createStore<GenerationState>(initializer(provider))
const desktopBridge = getDesktopBridge()
const defaultProvider: ImageProvider = desktopBridge ? new ChatGptDesktopProvider(desktopBridge) : chatGptImageProvider
export const useGenerationStore = create<GenerationState>(initializer(defaultProvider))

let observedDesktopBridge: DesktopBridgeApi | null = null
let stopObservingDesktopBridge: (() => void) | null = null

export function ensureDesktopGenerationEvents(bridge: DesktopBridgeApi): void {
  if (observedDesktopBridge === bridge) return
  disposeDesktopGenerationEvents()
  observedDesktopBridge = bridge
  stopObservingDesktopBridge = bridge.onGenerationEvent((event) => {
    useGenerationStore.getState().handleDesktopGenerationEvent(event)
  })
}

export function disposeDesktopGenerationEvents(): void {
  stopObservingDesktopBridge?.()
  stopObservingDesktopBridge = null
  observedDesktopBridge = null
}

import.meta.hot?.dispose(disposeDesktopGenerationEvents)

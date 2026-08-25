import { create } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand/vanilla'

import { getDesktopBridge } from '../desktop/desktopBridge'
import { ChatGptDesktopProvider } from './providers/ChatGptDesktopProvider'
import { chatGptImageProvider } from './chatGptProvider'
import type { ImageGenerationTask, ImageProvider, ProviderAvailability } from './types'

const terminal = new Set(['completed', 'failed', 'cancelled', 'refused', 'rate_limited', 'page_changed'])
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface GenerationState {
  prompt: string
  availability: ProviderAvailability | null
  task: ImageGenerationTask | null
  error: string | null
  isPanelOpen: boolean
  imageIds: string[]
  recoverable: boolean
  providerMode: string
  setPrompt(value: string): void
  setPanelOpen(value: boolean): void
  refreshAvailability(): Promise<void>
  generate(projectId: string, prompt: string): Promise<ImageGenerationTask | null>
  cancel(): Promise<void>
}

const initializer = (provider: ImageProvider): StateCreator<GenerationState> => (set, get) => ({
  prompt: '', availability: null, task: null, error: null, isPanelOpen: false, imageIds: [], recoverable: false, providerMode: provider.id,
  setPrompt: (prompt) => set({ prompt }),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
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

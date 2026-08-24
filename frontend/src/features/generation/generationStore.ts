import { create } from 'zustand'
import { createStore } from 'zustand/vanilla'
import type { StateCreator } from 'zustand/vanilla'

import { chatGptImageProvider } from './chatGptProvider'
import type { ImageGenerationTask, ImageProvider, ProviderAvailability } from './types'

const terminal = new Set(['completed', 'failed', 'cancelled'])
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface GenerationState {
  prompt: string
  availability: ProviderAvailability | null
  task: ImageGenerationTask | null
  error: string | null
  isPanelOpen: boolean
  setPrompt(value: string): void
  setPanelOpen(value: boolean): void
  refreshAvailability(): Promise<void>
  generate(projectId: string, prompt: string): Promise<ImageGenerationTask | null>
  cancel(): Promise<void>
}

const initializer = (provider: ImageProvider): StateCreator<GenerationState> => (set, get) => ({
  prompt: '', availability: null, task: null, error: null, isPanelOpen: false,
  setPrompt: (prompt) => set({ prompt }),
  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),
  refreshAvailability: async () => { try { set({ availability: await provider.getAvailability(), error: null }) } catch (error) { set({ error: error instanceof Error ? error.message : '连接失败' }) } },
  generate: async (projectId, prompt) => {
    set({ prompt, error: null, task: null })
    try {
      let task = await provider.generate({ projectId, prompt })
      set({ task })
      while (!terminal.has(task.status)) { await delay(1500); task = await provider.getTask(task.id); set({ task }) }
      if (task.status === 'failed') set({ error: task.progressMessage })
      return task
    } catch (error) { set({ error: error instanceof Error ? error.message : '生成失败' }); return null }
  },
  cancel: async () => { const task = get().task; if (task && !terminal.has(task.status)) await provider.cancel(task.id) },
})

export const createGenerationStore = (provider: ImageProvider) => createStore<GenerationState>(initializer(provider))
export const useGenerationStore = create<GenerationState>(initializer(chatGptImageProvider))

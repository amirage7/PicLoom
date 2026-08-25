import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopBridgeApi } from '../../desktop/types'
import * as api from '../generationApi'
import { ChatGptDesktopProvider } from './ChatGptDesktopProvider'

vi.mock('../generationApi')

function bridge(): DesktopBridgeApi {
  return {
    getRuntimeStatus: vi.fn(async () => ({ backendOnline: true, chatgptVisible: false })),
    setChatGptView: vi.fn(async () => undefined),
    reloadChatGpt: vi.fn(async () => undefined),
    startGeneration: vi.fn(async () => undefined),
    cancelGeneration: vi.fn(async () => undefined),
    retryCollection: vi.fn(async () => undefined),
    onGenerationEvent: vi.fn(() => () => undefined),
  }
}

const task: api.TaskDto = {
  id: 'task-1', project_id: 'project-1', provider: 'chatgpt-web', provider_mode: 'desktop',
  prompt: '一朵花', parent_image_id: null, status: 'queued', progress_message: 'queued',
  chat_url: null, image_id: null, image_ids_json: '[]', error_code: null,
}

beforeEach(() => vi.resetAllMocks())

describe('ChatGPT desktop provider', () => {
  it('creates a backend task before starting embedded ChatGPT', async () => {
    const desktopBridge = bridge()
    vi.mocked(api.createGenerationTask).mockResolvedValue(task)
    vi.mocked(api.getGenerationTask).mockResolvedValue(task)
    const provider = new ChatGptDesktopProvider(desktopBridge)

    await provider.generate({ projectId: 'project-1', prompt: '一朵花' })

    expect(desktopBridge.startGeneration).toHaveBeenCalledWith({
      taskId: 'task-1', projectId: 'project-1', prompt: '一朵花', parentImageId: null,
      referenceImages: [],
    })
    expect(provider.capabilities.multipleImages).toBe(true)
  })

  it('returns ordered image IDs and delegates recovery commands', async () => {
    const desktopBridge = bridge()
    vi.mocked(api.getGenerationTask).mockResolvedValue({
      ...task, status: 'completed', image_id: 'image-1', image_ids_json: '["image-1","image-2"]',
    })
    const provider = new ChatGptDesktopProvider(desktopBridge)

    const completed = await provider.getTask('task-1')
    await provider.cancel('task-1')
    await provider.retryCollection('task-1')

    expect(completed.imageIds).toEqual(['image-1', 'image-2'])
    expect(desktopBridge.cancelGeneration).toHaveBeenCalledWith('task-1')
    expect(desktopBridge.retryCollection).toHaveBeenCalledWith('task-1')
  })
})

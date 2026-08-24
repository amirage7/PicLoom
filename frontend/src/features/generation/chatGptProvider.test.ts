import { beforeEach, expect, it, vi } from 'vitest'

import * as api from './generationApi'
import { ChatGptImageProvider } from './chatGptProvider'


vi.mock('./generationApi')


beforeEach(() => vi.resetAllMocks())


it('creates a task and reads its later state', async () => {
  vi.mocked(api.createGenerationTask).mockResolvedValue({
    id: 'task-1', project_id: 'project-1', provider: 'chatgpt-web', prompt: 'quiet observatory',
    parent_image_id: null, status: 'queued', progress_message: 'queued', chat_url: null,
    image_id: null, error_code: null,
  })
  vi.mocked(api.getGenerationTask).mockResolvedValue({
    id: 'task-1', project_id: 'project-1', provider: 'chatgpt-web', prompt: 'quiet observatory',
    parent_image_id: null, status: 'completed', progress_message: 'done', chat_url: null,
    image_id: 'image-1', error_code: null,
  })
  const provider = new ChatGptImageProvider()

  const created = await provider.generate({ projectId: 'project-1', prompt: 'quiet observatory' })
  const completed = await provider.getTask(created.id)

  expect(completed.imageId).toBe('image-1')
})

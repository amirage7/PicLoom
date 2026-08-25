import { expect, it, vi } from 'vitest'

import { createGenerationStore } from './generationStore'
import type { ImageProvider } from './types'


it('keeps the prompt and error after a failed task', async () => {
  const provider = {
    id: 'chatgpt-web',
    getAvailability: vi.fn().mockResolvedValue({ paired: true, online: true, state: 'ready', chatUrl: null, extensionVersion: '0.1.0' }),
    generate: vi.fn().mockRejectedValue(new Error('请登录')),
    getTask: vi.fn(),
    cancel: vi.fn(),
  } satisfies ImageProvider
  const store = createGenerationStore(provider)

  await store.getState().generate('project-1', 'quiet observatory')

  expect(store.getState().prompt).toBe('quiet observatory')
  expect(store.getState().error).toBe('请登录')
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/resourcesApi'
import { useAppStore } from './store'


vi.mock('../lib/resourcesApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/resourcesApi')>('../lib/resourcesApi')
  return {
    ...actual,
    listProjects: vi.fn(),
    listPrompts: vi.fn(),
    createProject: vi.fn(),
  }
})

describe('persisted resource store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAppStore.setState({
      projects: [],
      prompts: [],
      activeProjectId: '',
      saveStatus: 'idle',
      error: null,
    })
  })

  it('hydrates projects and prompts from the backend', async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      { id: 'server-project', name: 'Server Project', created_time: '2026-08-24T00:00:00Z', image_count: 2 },
    ])
    vi.mocked(api.listPrompts).mockResolvedValue([
      { id: 'prompt-1', title: 'Prompt', content: 'Content', category: '摄影', created_time: '2026-08-24T00:00:00Z' },
    ])

    await useAppStore.getState().hydrateResources()

    expect(useAppStore.getState().projects[0]).toMatchObject({ id: 'server-project', imageCount: 2 })
    expect(useAppStore.getState().activeProjectId).toBe('server-project')
    expect(useAppStore.getState().saveStatus).toBe('saved')
  })

  it('preserves editable state and reports failed saves', async () => {
    vi.mocked(api.createProject).mockRejectedValue(new Error('后端离线'))

    await expect(useAppStore.getState().createProject('Draft')).rejects.toThrow('后端离线')

    expect(useAppStore.getState().saveStatus).toBe('error')
    expect(useAppStore.getState().error).toBe('后端离线')
  })
})

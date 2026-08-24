import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../../lib/resourcesApi'
import { useAppStore } from '../../../app/store'
import { useCanvasStore } from './canvasStore'


vi.mock('../../../lib/resourcesApi', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/resourcesApi')>('../../../lib/resourcesApi')
  return { ...actual, listImages: vi.fn(), patchImage: vi.fn(), uploadImage: vi.fn() }
})

const parent = {
  id: 'parent', project_id: 'future-city', image_path: 'images/future-city/parent.png',
  image_url: '/media/images/future-city/parent.png', file_name: 'parent.png', prompt: 'Parent',
  tags: ['建筑'], parent_id: null, position_x: 10, position_y: 20, created_time: '2026-08-24T00:00:00Z',
}
const child = { ...parent, id: 'child', file_name: 'child.png', image_url: '/media/images/future-city/child.png', parent_id: 'parent', position_x: 300 }

describe('persisted canvas store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCanvasStore.getState().reset()
    useAppStore.setState({ saveStatus: 'idle', error: null })
  })

  it('hydrates nodes and derives edges from parent ids', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, child])

    await useCanvasStore.getState().loadCanvas('future-city')

    const canvas = useCanvasStore.getState().canvases['future-city']
    expect(canvas.nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 300, y: 20 })
    expect(canvas.edges).toContainEqual(expect.objectContaining({ source: 'parent', target: 'child' }))
  })

  it('persists final node position and updates save status', async () => {
    vi.mocked(api.patchImage).mockResolvedValue({ ...parent, position_x: 88, position_y: 99 })

    await useCanvasStore.getState().persistPosition('future-city', 'parent', { x: 88, y: 99 })

    expect(api.patchImage).toHaveBeenCalledWith('parent', { position_x: 88, position_y: 99 })
    expect(useAppStore.getState().saveStatus).toBe('saved')
  })

  it('uploads files through the backend before adding nodes', async () => {
    vi.mocked(api.uploadImage).mockResolvedValue(parent)
    const file = new File(['png'], 'parent.png', { type: 'image/png' })

    const ids = await useCanvasStore.getState().uploadPersistedImages('future-city', [file], { x: 10, y: 20 })

    expect(ids).toEqual(['parent'])
    expect(useCanvasStore.getState().canvases['future-city'].nodes.some((node) => node.id === 'parent')).toBe(true)
  })
})

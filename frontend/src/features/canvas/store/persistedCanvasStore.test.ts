import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../../../lib/resourcesApi'
import type { ImageDto } from '../../../lib/resourcesApi'
import { useAppStore } from '../../../app/store'
import { useCanvasStore } from './canvasStore'


vi.mock('../../../lib/resourcesApi', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/resourcesApi')>('../../../lib/resourcesApi')
  return { ...actual, listImages: vi.fn(), patchImage: vi.fn(), uploadImage: vi.fn(), createImageRelation: vi.fn(), deleteImageRelation: vi.fn() }
})

const parent = {
  id: 'parent', project_id: 'future-city', image_path: 'images/future-city/parent.png',
  image_url: '/media/images/future-city/parent.png', file_name: 'parent.png', name: '父图', prompt: 'Parent',
  tags: ['建筑'], parent_id: null, source_ids: [], position_x: 10, position_y: 20, created_time: '2026-08-24T00:00:00Z',
}
const secondSource = { ...parent, id: 'source-b', file_name: 'source-b.png', image_url: '/media/images/future-city/source-b.png', name: '第二张来源图', position_x: 160 }
const child = { ...parent, id: 'child', file_name: 'child.png', image_url: '/media/images/future-city/child.png', parent_id: 'parent', source_ids: ['parent', 'source-b'], position_x: 300 }
const childWithOneSource = { ...child, source_ids: ['parent'] }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('persisted canvas store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCanvasStore.getState().reset()
    useAppStore.setState({ saveStatus: 'idle', error: null })
  })

  it('hydrates one incoming edge for every source id', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, secondSource, child])

    await useCanvasStore.getState().loadCanvas('future-city')

    const canvas = useCanvasStore.getState().canvases['future-city']
    expect(canvas.nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 300, y: 20 })
    expect(canvas.edges.filter((edge) => edge.target === 'child')).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'parent', target: 'child', interactionWidth: 24 }),
      expect.objectContaining({ source: 'source-b', target: 'child', interactionWidth: 24 }),
    ]))
    expect(canvas.nodes.find((node) => node.id === 'child')?.data.image.sourceIds).toEqual(['parent', 'source-b'])
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

  it('persists an additional source without replacing existing incoming edges', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, secondSource, child])
    vi.mocked(api.createImageRelation).mockResolvedValue({
      id: 'relation-1', source_id: 'parent', target_id: 'child', relation_type: 'source', created_time: '2026-08-24T00:00:00Z',
    })
    await useCanvasStore.getState().loadCanvas('future-city')

    await useCanvasStore.getState().persistConnection('future-city', 'parent', 'child')

    expect(api.createImageRelation).toHaveBeenCalledWith('parent', 'child')
    expect(useCanvasStore.getState().canvases['future-city'].edges.filter((edge) => edge.target === 'child')).toHaveLength(2)
  })

  it('deletes only the selected relation and leaves both image nodes intact', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, secondSource, child])
    vi.mocked(api.deleteImageRelation).mockResolvedValue(undefined)
    await useCanvasStore.getState().loadCanvas('future-city')

    await useCanvasStore.getState().persistEdgeDeletion('future-city', 'parent', 'child')

    expect(api.deleteImageRelation).toHaveBeenCalledWith('parent', 'child')
    const canvas = useCanvasStore.getState().canvases['future-city']
    expect(canvas.nodes.map((node) => node.id)).toEqual(['parent', 'source-b', 'child'])
    expect(canvas.edges).toContainEqual(expect.objectContaining({ source: 'source-b', target: 'child' }))
    expect(canvas.edges).not.toContainEqual(expect.objectContaining({ source: 'parent', target: 'child' }))
    expect(canvas.nodes.find((node) => node.id === 'child')?.data.image.sourceIds).toEqual(['source-b'])
  })

  it('persists remove changes emitted by React Flow', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, child])
    vi.mocked(api.deleteImageRelation).mockResolvedValue(undefined)
    await useCanvasStore.getState().loadCanvas('future-city')

    useCanvasStore.getState().applyEdgeChanges('future-city', [{ id: 'edge-parent-child', type: 'remove' }])

    await vi.waitFor(() => expect(api.deleteImageRelation).toHaveBeenCalledWith('parent', 'child'))
    expect(useCanvasStore.getState().canvases['future-city'].nodes).toHaveLength(2)
  })

  it('ignores an older load response when a newer project load finishes first', async () => {
    const older = deferred<ImageDto[]>()
    const newer = deferred<ImageDto[]>()
    vi.mocked(api.listImages)
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)

    const olderLoad = useCanvasStore.getState().loadCanvas('future-city')
    const newerLoad = useCanvasStore.getState().loadCanvas('future-city')
    newer.resolve([secondSource])
    await newerLoad
    older.resolve([parent])
    await olderLoad

    expect(useCanvasStore.getState().canvases['future-city'].nodes.map((node) => node.id)).toEqual(['source-b'])
  })

  it('does not let an in-flight load overwrite a completed relation mutation', async () => {
    vi.mocked(api.listImages).mockResolvedValueOnce([parent, secondSource, childWithOneSource])
    await useCanvasStore.getState().loadCanvas('future-city')
    const stale = deferred<ImageDto[]>()
    vi.mocked(api.listImages).mockReturnValueOnce(stale.promise)
    vi.mocked(api.createImageRelation).mockResolvedValue({
      id: 'relation-2', source_id: 'source-b', target_id: 'child', relation_type: 'source', created_time: '2026-08-24T00:00:00Z',
    })

    const staleLoad = useCanvasStore.getState().loadCanvas('future-city')
    await useCanvasStore.getState().persistConnection('future-city', 'source-b', 'child')
    stale.resolve([parent, secondSource, childWithOneSource])
    await staleLoad

    expect(useCanvasStore.getState().canvases['future-city'].edges.filter((edge) => edge.target === 'child')).toHaveLength(2)
  })

  it('invalidates a load started while connection creation is still pending', async () => {
    vi.mocked(api.listImages).mockResolvedValueOnce([parent, secondSource, childWithOneSource])
    await useCanvasStore.getState().loadCanvas('future-city')
    const relation = deferred<Awaited<ReturnType<typeof api.createImageRelation>>>()
    const staleLoadResult = deferred<ImageDto[]>()
    vi.mocked(api.createImageRelation).mockReturnValueOnce(relation.promise)
    vi.mocked(api.listImages).mockReturnValueOnce(staleLoadResult.promise)

    const mutation = useCanvasStore.getState().persistConnection('future-city', 'source-b', 'child')
    const staleLoad = useCanvasStore.getState().loadCanvas('future-city')
    relation.resolve({
      id: 'relation-late', source_id: 'source-b', target_id: 'child', relation_type: 'source', created_time: '2026-08-24T00:00:00Z',
    })
    await mutation
    staleLoadResult.resolve([parent, secondSource, childWithOneSource])
    await staleLoad

    expect(useCanvasStore.getState().canvases['future-city'].edges.filter((edge) => edge.target === 'child')).toHaveLength(2)
  })

  it('invalidates a load started while relation deletion is still pending', async () => {
    vi.mocked(api.listImages).mockResolvedValueOnce([parent, childWithOneSource])
    await useCanvasStore.getState().loadCanvas('future-city')
    const deletion = deferred<void>()
    const staleLoadResult = deferred<ImageDto[]>()
    vi.mocked(api.deleteImageRelation).mockReturnValueOnce(deletion.promise)
    vi.mocked(api.listImages).mockReturnValueOnce(staleLoadResult.promise)

    const mutation = useCanvasStore.getState().persistEdgeDeletion('future-city', 'parent', 'child')
    const staleLoad = useCanvasStore.getState().loadCanvas('future-city')
    deletion.resolve(undefined)
    await mutation
    staleLoadResult.resolve([parent, childWithOneSource])
    await staleLoad

    expect(useCanvasStore.getState().canvases['future-city'].edges).toHaveLength(0)
    expect(useCanvasStore.getState().canvases['future-city'].nodes).toHaveLength(2)
  })

  it('deduplicates an in-flight edge deletion and clears its selection immediately', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, childWithOneSource])
    await useCanvasStore.getState().loadCanvas('future-city')
    useCanvasStore.getState().selectEdge('future-city', 'edge-parent-child')
    const pending = deferred<void>()
    vi.mocked(api.deleteImageRelation).mockReturnValue(pending.promise)

    const first = useCanvasStore.getState().persistEdgeDeletion('future-city', 'parent', 'child')
    const second = useCanvasStore.getState().persistEdgeDeletion('future-city', 'parent', 'child')

    expect(api.deleteImageRelation).toHaveBeenCalledTimes(1)
    expect(useCanvasStore.getState().canvases['future-city'].edges[0].selected).toBe(false)
    pending.resolve(undefined)
    await Promise.all([first, second])
  })

  it('keeps the edge after a failed deletion and allows a later retry', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, childWithOneSource])
    await useCanvasStore.getState().loadCanvas('future-city')
    vi.mocked(api.deleteImageRelation)
      .mockRejectedValueOnce(new Error('暂时无法删除关系'))
      .mockResolvedValueOnce(undefined)

    await expect(useCanvasStore.getState().persistEdgeDeletion('future-city', 'parent', 'child'))
      .rejects.toThrow('暂时无法删除关系')
    expect(useCanvasStore.getState().canvases['future-city'].edges).toContainEqual(
      expect.objectContaining({ source: 'parent', target: 'child', selected: false }),
    )

    await useCanvasStore.getState().persistEdgeDeletion('future-city', 'parent', 'child')
    expect(api.deleteImageRelation).toHaveBeenCalledTimes(2)
    expect(useCanvasStore.getState().canvases['future-city'].edges).toHaveLength(0)
  })

  it('keeps node object references stable for edge selection-only changes', async () => {
    vi.mocked(api.listImages).mockResolvedValue([parent, childWithOneSource])
    await useCanvasStore.getState().loadCanvas('future-city')
    const nodesBefore = useCanvasStore.getState().canvases['future-city'].nodes

    useCanvasStore.getState().applyEdgeChanges('future-city', [
      { id: 'edge-parent-child', type: 'select', selected: true },
    ])

    expect(useCanvasStore.getState().canvases['future-city'].nodes).toBe(nodesBefore)
  })
})

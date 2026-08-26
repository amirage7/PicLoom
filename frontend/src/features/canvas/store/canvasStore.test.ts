import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetObjectUrlRegistry, useCanvasStore } from './canvasStore'


describe('canvas store', () => {
  beforeEach(() => {
    resetObjectUrlRegistry()
    useCanvasStore.getState().reset()
  })

  it('keeps project canvases isolated', () => {
    useCanvasStore.getState().duplicateNode('future-city', 'city-overview')

    expect(useCanvasStore.getState().canvases['future-city'].nodes).toHaveLength(4)
    expect(useCanvasStore.getState().canvases['product-concepts'].nodes).toHaveLength(0)
  })

  it('duplicates a node with an offset and no new relationship', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')

    const id = useCanvasStore.getState().duplicateNode('future-city', 'city-overview')
    const node = useCanvasStore
      .getState()
      .canvases['future-city']
      .nodes.find((item) => item.id === id)

    expect(node?.position).toEqual({ x: 100, y: 100 })
    expect(node?.data.image.parentId).toBeNull()
    expect(node?.data.image.id).toBe(id)
  })

  it('adds a child incoming relationship without replacing existing sources', () => {
    useCanvasStore
      .getState()
      .connectNodes('future-city', {
        source: 'city-overview',
        target: 'transit-hub',
        sourceHandle: null,
        targetHandle: null,
      })

    const canvas = useCanvasStore.getState().canvases['future-city']

    expect(canvas.edges.filter((edge) => edge.target === 'transit-hub')).toHaveLength(2)
    expect(canvas.nodes.find((node) => node.id === 'transit-hub')?.data.image.sourceIds)
      .toEqual(['street-level', 'city-overview'])
  })

  it('rejects self connections', () => {
    const before = useCanvasStore.getState().canvases['future-city'].edges

    useCanvasStore
      .getState()
      .connectNodes('future-city', {
        source: 'city-overview',
        target: 'city-overview',
        sourceHandle: null,
        targetHandle: null,
      })

    expect(useCanvasStore.getState().canvases['future-city'].edges).toEqual(before)
  })

  it('selects one relation and clears the selected image', () => {
    useCanvasStore.getState().selectNode('future-city', 'city-overview')

    useCanvasStore.getState().selectEdge('future-city', 'edge-city-overview-street-level')

    const canvas = useCanvasStore.getState().canvases['future-city']
    expect(canvas.selectedNodeId).toBeNull()
    expect(canvas.nodes.every((node) => !node.selected)).toBe(true)
    expect(canvas.edges.find((edge) => edge.id === 'edge-city-overview-street-level')?.selected).toBe(true)
  })

  it('deletes a node, connected edges, and orphaned parent references', () => {
    useCanvasStore.getState().deleteNode('future-city', 'street-level')

    const canvas = useCanvasStore.getState().canvases['future-city']

    expect(canvas.nodes.some((node) => node.id === 'street-level')).toBe(false)
    expect(canvas.edges.some((edge) => edge.source === 'street-level' || edge.target === 'street-level'))
      .toBe(false)
    expect(canvas.nodes.find((node) => node.id === 'transit-hub')?.data.image.parentId).toBeNull()
    expect(canvas.nodes.find((node) => node.id === 'transit-hub')?.data.image.sourceIds).toEqual([])
  })

  it('releases an uploaded object URL only after its final copy is deleted', () => {
    const createObjectURL = vi.fn(() => 'blob:fixture')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000003')

    const [uploadedId] = useCanvasStore.getState().addUploadedImages(
      'product-concepts',
      [new File(['image'], 'chair.png', { type: 'image/png' })],
      { x: 20, y: 30 },
    )
    const copyId = useCanvasStore.getState().duplicateNode('product-concepts', uploadedId)
    expect(copyId).not.toBeNull()

    useCanvasStore.getState().deleteNode('product-concepts', uploadedId)
    expect(revokeObjectURL).not.toHaveBeenCalled()

    useCanvasStore.getState().deleteNode('product-concepts', copyId!)
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fixture')
  })

  it('highlights an imported batch and uses its first image for details', () => {
    useCanvasStore.getState().selectImportedBatch('future-city', ['street-level', 'transit-hub'])
    const canvas = useCanvasStore.getState().canvases['future-city']

    expect(canvas.selectedNodeId).toBe('street-level')
    expect(canvas.nodes.filter((node) => node.selected).map((node) => node.id))
      .toEqual(['street-level', 'transit-hub'])
  })
})

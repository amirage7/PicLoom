import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../../app/store'
import * as api from '../../lib/resourcesApi'
import { useCanvasStore } from './store/canvasStore'
import { Board } from './CanvasBoard'

vi.mock('../../lib/resourcesApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/resourcesApi')>('../../lib/resourcesApi')
  return { ...actual, deleteImageRelation: vi.fn() }
})

vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react')
  return {
    ...actual,
    Background: () => null,
    ReactFlow: ({ edges, deleteKeyCode, onEdgeClick }: {
      edges: Array<{ id: string; source: string; target: string }>
      deleteKeyCode: unknown
      onEdgeClick: (event: unknown, edge: { id: string; source: string; target: string }) => void
    }) => (
      <div data-testid="react-flow" data-delete-key-code={String(deleteKeyCode)}>
        <button type="button" onClick={() => onEdgeClick({}, edges[0])}>选择第一条连线</button>
      </div>
    ),
    useReactFlow: () => ({
      fitView: vi.fn(), screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
      zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn(),
    }),
    useViewport: () => ({ zoom: 1 }),
  }
})

describe('CanvasBoard relation deletion wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useCanvasStore.getState().reset()
    useAppStore.setState({ activeProjectId: 'future-city', saveStatus: 'offline' })
    vi.mocked(api.deleteImageRelation).mockResolvedValue(undefined)
  })

  it.each(['Delete', 'Backspace'])('selects an edge and routes %s to relation deletion without deleting nodes', async (key) => {
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    const nodeIdsBefore = useCanvasStore.getState().canvases['future-city'].nodes.map((node) => node.id)
    render(<Board projectId="future-city" shortcutsEnabled isRightPanelOpen onToggleRight={vi.fn()} />)

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-delete-key-code', 'null')
    fireEvent.click(screen.getByRole('button', { name: '选择第一条连线' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

    await waitFor(() => expect(api.deleteImageRelation).toHaveBeenCalledWith('city-overview', 'street-level'))
    expect(useCanvasStore.getState().canvases['future-city'].nodes.map((node) => node.id)).toEqual(nodeIdsBefore)
  })
})

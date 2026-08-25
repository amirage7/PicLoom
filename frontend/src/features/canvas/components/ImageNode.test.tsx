import { ReactFlow, ReactFlowProvider } from '@xyflow/react'
import { render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { CanvasNode } from '../../../types/domain'
import { ImageNode } from './ImageNode'


const node: CanvasNode = {
  id: 'node-1',
  type: 'image',
  position: { x: 0, y: 0 },
  data: {
    image: {
      id: 'node-1',
      projectId: 'future-city',
      imageUrl: '/fixture.webp',
      imageSource: 'fixture',
      fileName: 'fixture.webp',
      name: '滨海未来城市',
      prompt: 'A calm coastal city with precise civic architecture',
      tags: ['建筑'],
      parentId: null,
      createdTime: '2026-08-21T09:30:00+08:00',
    },
  },
}

describe('ImageNode', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    })
  })

  it('shows image metadata, handles, and node actions', () => {
    render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlowProvider>
          <ReactFlow nodes={[node]} edges={[]} nodeTypes={{ image: ImageNode }} />
        </ReactFlowProvider>
      </div>,
    )

    expect(screen.getByAltText('fixture.webp')).toBeInTheDocument()
    expect(screen.getByText('滨海未来城市')).toBeInTheDocument()
    expect(screen.getByText('A calm coastal city with precise civic architecture')).toBeInTheDocument()
    expect(screen.getByText('2026/08/21 09:30')).toBeInTheDocument()
    expect(screen.getByLabelText('父版本连接点')).toBeInTheDocument()
    expect(screen.getByLabelText('子版本连接点')).toBeInTheDocument()
    expect(screen.getByLabelText('复制节点')).toBeInTheDocument()
    expect(screen.getByLabelText('删除节点')).toBeInTheDocument()
  })
})

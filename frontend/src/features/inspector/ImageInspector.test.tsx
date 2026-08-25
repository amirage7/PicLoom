import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../../app/store'
import { useCanvasStore } from '../canvas/store/canvasStore'
import { ImageInspector } from './ImageInspector'

describe('ImageInspector', () => {
  beforeEach(() => {
    useAppStore.setState({ activeProjectId: 'future-city' })
    useCanvasStore.getState().reset()
  })

  it('shows selected image metadata and saves prompt and tags', async () => {
    const user = userEvent.setup()
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)

    expect(screen.getByAltText('city-overview.webp')).toBeInTheDocument()
    expect(screen.getByText('初始版本')).toBeInTheDocument()

    const prompt = screen.getByRole('textbox', { name: '图片 Prompt' })
    await user.clear(prompt)
    await user.type(prompt, 'Updated city prompt')
    await user.tab()

    const tags = screen.getByRole('textbox', { name: '图片标签' })
    await user.clear(tags)
    await user.type(tags, '建筑, 夜景, 建筑')
    await user.tab()

    const image = useCanvasStore.getState().canvases['future-city'].nodes
      .find((node) => node.id === 'city-overview')?.data.image
    expect(image?.prompt).toBe('Updated city prompt')
    expect(image?.tags).toEqual(['建筑', '夜景'])
  })

  it('keeps the empty state when no node is selected', () => {
    render(<ImageInspector />)
    expect(screen.getByText('未选择图片')).toBeInTheDocument()
  })

  it('opens the original viewer and saves the selected image', async () => {
    const user = userEvent.setup()
    const saveImage = vi.fn(async () => ({ saved: true, filePath: 'C:\\Pictures\\city.webp' }))
    window.aiImageCanvasDesktop = {
      getRuntimeStatus: vi.fn(), setChatGptView: vi.fn(), reloadChatGpt: vi.fn(),
      startGeneration: vi.fn(), cancelGeneration: vi.fn(), retryCollection: vi.fn(),
      onGenerationEvent: vi.fn(() => () => undefined), saveImage,
    }
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)
    await user.click(screen.getByRole('button', { name: '查看原图' }))
    expect(screen.getByRole('dialog', { name: '查看 city-overview.webp' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '放大' }))
    expect(screen.getByText('125%')).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存原图' }))
    await waitFor(() => expect(saveImage).toHaveBeenCalledWith({
      imageId: 'city-overview', fileName: 'city-overview.webp',
    }))
    delete window.aiImageCanvasDesktop
  })
})

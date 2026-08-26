import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../../app/store'
import { useCanvasStore } from '../canvas/store/canvasStore'
import { useGenerationStore } from '../generation/generationStore'
import { ImageInspector } from './ImageInspector'

describe('ImageInspector', () => {
  beforeEach(() => {
    useAppStore.setState({ activeProjectId: 'future-city' })
    useCanvasStore.getState().reset()
    useGenerationStore.setState({ prompt: '', quickAction: null, isPanelOpen: false })
  })

  it('shows selected image metadata and saves prompt and tags', async () => {
    const user = userEvent.setup()
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)

    expect(screen.getByAltText('city-overview.webp')).toBeInTheDocument()
    expect(screen.getByText('无（初始图片）')).toBeInTheDocument()

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

  it('renames a stored image from the details panel', async () => {
    const user = userEvent.setup()
    const persistMetadata = vi.fn(async () => undefined)
    useCanvasStore.setState({ persistMetadata })
    const canvas = useCanvasStore.getState().canvases['future-city']
    useCanvasStore.setState({
      canvases: {
        ...useCanvasStore.getState().canvases,
        'future-city': {
          ...canvas,
          nodes: canvas.nodes.map((node) => node.id === 'city-overview'
            ? { ...node, data: { image: { ...node.data.image, imageSource: 'stored' } } }
            : node),
        },
      },
    })
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)

    const input = screen.getByRole('textbox', { name: '图片名称' })
    await user.clear(input)
    await user.type(input, '假面骑士build')
    await user.tab()

    await waitFor(() => expect(persistMetadata).toHaveBeenCalledWith(
      'future-city', 'city-overview', { name: '假面骑士build' },
    ))
  })

  it('shows a conflict message without discarding the typed image name', async () => {
    const user = userEvent.setup()
    const persistMetadata = vi.fn(async () => { throw new Error('当前项目已有同名图片') })
    useCanvasStore.setState({ persistMetadata })
    const canvas = useCanvasStore.getState().canvases['future-city']
    useCanvasStore.setState({
      canvases: {
        ...useCanvasStore.getState().canvases,
        'future-city': {
          ...canvas,
          nodes: canvas.nodes.map((node) => node.id === 'city-overview'
            ? { ...node, data: { image: { ...node.data.image, imageSource: 'stored' } } }
            : node),
        },
      },
    })
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)

    const input = screen.getByRole('textbox', { name: '图片名称' })
    await user.clear(input)
    await user.type(input, '喜羊羊')
    await user.tab()

    expect(await screen.findByRole('alert')).toHaveTextContent('当前项目已有同名图片')
    expect(input).toHaveValue('喜羊羊')
  })

  it('keeps the empty state when no node is selected', () => {
    render(<ImageInspector />)
    expect(screen.getByText('未选择图片')).toBeInTheDocument()
  })

  it('lists every source image name and the derived image count', () => {
    const canvas = useCanvasStore.getState().canvases['future-city']
    useCanvasStore.setState({
      canvases: {
        ...useCanvasStore.getState().canvases,
        'future-city': {
          ...canvas,
          nodes: canvas.nodes.map((node) => node.id === 'transit-hub'
            ? { ...node, data: { image: { ...node.data.image, sourceIds: ['city-overview', 'street-level'] } } }
            : node),
          edges: [...canvas.edges, { id: 'edge-city-overview-transit-hub', source: 'city-overview', target: 'transit-hub' }],
        },
      },
    })
    useCanvasStore.getState().selectNode('future-city', 'transit-hub')

    render(<ImageInspector />)

    expect(screen.getByText('来源图片')).toBeInTheDocument()
    expect(screen.getByText('滨海未来城市、滨海步行街')).toBeInTheDocument()
    expect(screen.getByText('派生图片')).toBeInTheDocument()
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
    expect(screen.getByText('适应')).toBeInTheDocument()
    expect(screen.getByTestId('original-image')).toHaveAttribute('data-fit', 'true')
    await user.click(screen.getByRole('button', { name: '放大' }))
    expect(screen.getByText('125%')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭原图' }))
    await user.click(screen.getByRole('button', { name: '查看原图' }))
    expect(screen.getByText('适应')).toBeInTheDocument()
    expect(screen.getByTestId('original-image')).toHaveAttribute('data-fit', 'true')
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '保存原图' }))
    await waitFor(() => expect(saveImage).toHaveBeenCalledWith({
      imageId: 'city-overview', fileName: 'city-overview.webp',
    }))
    delete window.aiImageCanvasDesktop
  })

  it('queues the selected image for one-click background removal in desktop mode', async () => {
    const user = userEvent.setup()
    window.aiImageCanvasDesktop = {
      getRuntimeStatus: vi.fn(), setChatGptView: vi.fn(), reloadChatGpt: vi.fn(),
      startGeneration: vi.fn(), cancelGeneration: vi.fn(), retryCollection: vi.fn(),
      onGenerationEvent: vi.fn(() => () => undefined), saveImage: vi.fn(),
    }
    useCanvasStore.getState().updateImage('future-city', 'city-overview', { name: '假面骑士build' })
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)

    await user.click(screen.getByRole('button', { name: '移除背景' }))

    const expectedPrompt = '@假面骑士build 移除此图像的背景。保持所有前景主体不变且完整无损，边缘干净平滑。将背景设为透明。'
    expect(useGenerationStore.getState().prompt).toBe(expectedPrompt)
    expect(useGenerationStore.getState().quickAction).toMatchObject({
      projectId: 'future-city',
      prompt: expectedPrompt,
      referenceImages: [{ imageId: 'city-overview', name: '假面骑士build' }],
      transparentBackground: false,
    })
    expect(useGenerationStore.getState().isPanelOpen).toBe(true)
    delete window.aiImageCanvasDesktop
  })

  it('does not offer background removal without the desktop bridge', () => {
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ImageInspector />)

    expect(screen.queryByRole('button', { name: '移除背景' })).not.toBeInTheDocument()
  })
})

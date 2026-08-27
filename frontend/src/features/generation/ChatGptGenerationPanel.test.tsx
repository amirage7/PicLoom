import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopBridgeApi } from '../desktop/types'
import { useAppStore } from '../../app/store'
import { useCanvasStore } from '../canvas/store/canvasStore'
import { ChatGptGenerationPanel } from './ChatGptGenerationPanel'
import { useGenerationStore } from './generationStore'
import * as api from './generationApi'
import * as resourcesApi from '../../lib/resourcesApi'
import type { ImageDto } from '../../lib/resourcesApi'

vi.mock('./generationApi')

function installBridge(): DesktopBridgeApi {
  const bridge: DesktopBridgeApi = {
    getRuntimeStatus: vi.fn(async () => ({ backendOnline: true, chatgptVisible: false })),
    setChatGptView: vi.fn(async () => undefined),
    reloadChatGpt: vi.fn(async () => undefined),
    startGeneration: vi.fn(async () => undefined),
    cancelGeneration: vi.fn(async () => undefined),
    retryCollection: vi.fn(async () => undefined),
    saveImage: vi.fn(async () => ({ saved: false })),
    onGenerationEvent: vi.fn(() => () => undefined),
  }
  window.aiImageCanvasDesktop = bridge
  return bridge
}

beforeEach(() => {
  vi.clearAllMocks()
  useAppStore.setState({ activeProjectId: 'future-city' })
  useCanvasStore.getState().reset()
  useGenerationStore.setState({
    prompt: '', transparentBackground: false, quickAction: null, isPanelOpen: false,
    desktopBusy: false, desktopTaskId: null, desktopRecoverableTaskId: null, desktopEvent: null,
  })
  vi.mocked(api.createGenerationTask).mockResolvedValue({
    id: 'task-1', project_id: 'project-1', provider: 'chatgpt-web', prompt: '一朵花',
    parent_image_id: null, status: 'queued', progress_message: 'queued', chat_url: null,
    image_id: null, image_ids_json: '[]', provider_mode: 'desktop', error_code: null,
  })
})
afterEach(() => {
  delete window.aiImageCanvasDesktop
})

describe('ChatGptGenerationPanel', () => {
  it.each([
    ['refused', '生成被 ChatGPT 拒绝', '抱歉，我无法根据这个请求生成图片。'],
    ['failed', '生成失败', '下载图片失败'],
    ['rate_limited', '生成受限', '当前额度不足'],
  ] as const)('shows %s as error terminal feedback', async (state, title, message) => {
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="future-city" />)
    await waitFor(() => expect(bridge.onGenerationEvent).toHaveBeenCalledOnce())
    const listener = vi.mocked(bridge.onGenerationEvent).mock.calls[0][0]

    act(() => listener({ taskId: 'task-1', state, message, imageIds: [], recoverable: false }))

    expect(screen.getByRole('status')).toHaveTextContent(title)
    expect(screen.getByRole('status')).not.toHaveTextContent('正在生成')
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  it('shows cancellation as neutral terminal feedback without an in-progress dot', async () => {
    const bridge = installBridge()
    const { container } = render(<ChatGptGenerationPanel projectId="future-city" />)
    await waitFor(() => expect(bridge.onGenerationEvent).toHaveBeenCalledOnce())
    const listener = vi.mocked(bridge.onGenerationEvent).mock.calls[0][0]

    act(() => listener({ taskId: 'task-1', state: 'cancelled', message: '任务已取消', imageIds: [], recoverable: false }))

    expect(screen.getByRole('status')).toHaveTextContent('生成已取消')
    expect(screen.getByRole('status')).toHaveTextContent('任务已取消')
    expect(screen.getByRole('status')).not.toHaveTextContent('正在生成')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(container.querySelector('.desktop-generation-status span')).not.toBeInTheDocument()
  })

  it('shows the native view, reports bounds, and hides it on unmount', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    const { unmount } = render(<ChatGptGenerationPanel projectId="project-1" />)

    await user.click(screen.getByRole('button', { name: '登录 / 查看 ChatGPT' }))
    await waitFor(() => expect(bridge.setChatGptView).toHaveBeenCalledWith(expect.objectContaining({
      visible: true,
      bounds: expect.any(Object),
    })))
    unmount()

    expect(bridge.setChatGptView).toHaveBeenLastCalledWith({ visible: false })
  })

  it('submits the compact prompt through the desktop bridge', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="project-1" />)

    const transparentOption = screen.getByRole('button', { name: '透明背景' })
    expect(transparentOption).toHaveAttribute('aria-pressed', 'false')
    await user.click(transparentOption)
    expect(transparentOption).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', prompt: '一朵花', parentImageId: null,
      transparentBackground: true,
    })))
  })

  it('submits the selected destination rather than the active workspace', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    useAppStore.setState({
      projects: [
        { id: 'a', name: '角色创作', createdTime: '', imageCount: 0 },
        { id: 'b', name: '项目 logo', createdTime: '', imageCount: 0 },
      ],
      activeProjectId: 'a', workspaceMode: 'project',
    })
    render(<ChatGptGenerationPanel projectId="a" />)

    await user.selectOptions(screen.getByRole('combobox', { name: '保存到项目' }), 'b')
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith('b', '一朵花', undefined))
    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'b' }))
  })

  it('submits quick creation without assigning a project', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="future-city" />)

    await user.selectOptions(screen.getByRole('combobox', { name: '保存到项目' }), '')
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith(null, '一朵花', undefined))
    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }))
  })

  it('keeps the task destination locked when the panel workspace changes', async () => {
    const user = userEvent.setup()
    installBridge()
    useAppStore.setState({
      projects: [
        { id: 'a', name: '角色创作', createdTime: '', imageCount: 0 },
        { id: 'b', name: '项目 logo', createdTime: '', imageCount: 0 },
      ],
    })
    const { rerender } = render(<ChatGptGenerationPanel projectId="a" />)

    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))
    await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith('a', '一朵花', undefined))
    rerender(<ChatGptGenerationPanel projectId="b" />)

    expect(screen.getByRole('combobox', { name: '保存到项目' })).toBeDisabled()
    expect(screen.getByText('结果将保存到：角色创作')).toBeInTheDocument()
  })

  it('uses the newly active workspace after an idle panel rerender', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    useAppStore.setState({
      projects: [
        { id: 'a', name: '角色创作', createdTime: '', imageCount: 0 },
        { id: 'b', name: '项目 logo', createdTime: '', imageCount: 0 },
      ],
      activeProjectId: 'a', workspaceMode: 'project',
    })
    const { rerender } = render(<ChatGptGenerationPanel projectId="a" />)

    rerender(<ChatGptGenerationPanel projectId="b" />)
    expect(screen.getByRole('combobox', { name: '保存到项目' })).toHaveValue('b')
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith('b', '一朵花', undefined))
    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'b' }))
  })

  it('ignores stale image scopes after changing the destination', async () => {
    const user = userEvent.setup()
    installBridge()
    let resolveA!: (images: ImageDto[]) => void
    let resolveB!: (images: ImageDto[]) => void
    vi.spyOn(resourcesApi, 'listImages').mockImplementation((id) => new Promise((resolve) => {
      if (id === 'a') resolveA = resolve
      if (id === 'b') resolveB = resolve
    }))
    useAppStore.setState({
      projects: [
        { id: 'a', name: '角色创作', createdTime: '', imageCount: 0 },
        { id: 'b', name: '项目 logo', createdTime: '', imageCount: 0 },
      ],
    })
    render(<ChatGptGenerationPanel projectId="a" />)
    await waitFor(() => expect(resourcesApi.listImages).toHaveBeenCalledWith('a'))

    await user.selectOptions(screen.getByRole('combobox', { name: '保存到项目' }), 'b')
    await waitFor(() => expect(resourcesApi.listImages).toHaveBeenCalledWith('b'))
    act(() => resolveB([{
      id: 'image-b', project_id: 'b', image_path: '', image_url: 'b.png', file_name: 'b.png', name: '目标图片', prompt: '', tags: [], parent_id: null, source_ids: [], position_x: 0, position_y: 0, created_time: '',
    }]))
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '@')
    expect(await screen.findByRole('option', { name: /目标图片/ })).toBeInTheDocument()

    act(() => resolveA([{
      id: 'image-a', project_id: 'a', image_path: '', image_url: 'a.png', file_name: 'a.png', name: '旧目标图片', prompt: '', tags: [], parent_id: null, source_ids: [], position_x: 0, position_y: 0, created_time: '',
    }]))
    await waitFor(() => expect(screen.getByRole('option', { name: /目标图片/ })).toBeInTheDocument())
    expect(screen.queryByRole('option', { name: /旧目标图片/ })).not.toBeInTheDocument()
  })

  it('reloads the persistent ChatGPT page on request', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="project-1" />)

    await user.click(screen.getByRole('button', { name: '重新加载 ChatGPT 页面' }))

    expect(bridge.reloadChatGpt).toHaveBeenCalledOnce()
  })

  it('opens an image picker after @ and inserts the selected image name', async () => {
    const user = userEvent.setup()
    installBridge()
    useCanvasStore.getState().updateImage('future-city', 'street-level', { name: '喜羊羊' })
    render(<ChatGptGenerationPanel projectId="future-city" />)

    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    await user.type(prompt, '@喜')

    expect(screen.getByRole('listbox', { name: '选择引用图片' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(prompt).toHaveValue('@喜羊羊')
  })

  it('submits all mentioned images in text order and uses the first as parent', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    useCanvasStore.getState().updateImage('future-city', 'city-overview', { name: '假面骑士build' })
    useCanvasStore.getState().updateImage('future-city', 'street-level', { name: '喜羊羊' })
    render(<ChatGptGenerationPanel projectId="future-city" />)

    expect(screen.queryByRole('combobox', { name: '参考图片' })).not.toBeInTheDocument()
    const prompt = '将@假面骑士build的身体和@喜羊羊的头部合成一个新的角色'
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), prompt)
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith(
      'future-city', prompt, 'city-overview',
    ))
    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      parentImageId: 'city-overview',
      referenceImages: [
        { imageId: 'city-overview', name: '假面骑士build' },
        { imageId: 'street-level', name: '喜羊羊' },
      ],
    }))
  })

  it('shares the editable prompt with the generation store', async () => {
    const user = userEvent.setup()
    installBridge()
    useGenerationStore.setState({ prompt: '共享草稿' })
    render(<ChatGptGenerationPanel projectId="future-city" />)

    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    expect(prompt).toHaveValue('共享草稿')
    await user.type(prompt, '继续')
    expect(useGenerationStore.getState().prompt).toBe('共享草稿继续')
  })

  it('automatically starts a queued one-click action exactly once in StrictMode', async () => {
    const bridge = installBridge()
    const prompt = '@喜羊羊 移除此图像的背景。保持所有前景主体不变且完整无损，边缘干净平滑。将背景设为透明。'
    useGenerationStore.getState().enqueueQuickAction({
      projectId: 'future-city',
      prompt,
      referenceImages: [{ imageId: 'street-level', name: '喜羊羊' }],
      transparentBackground: false,
    })

    const { rerender } = render(
      <StrictMode><ChatGptGenerationPanel projectId="future-city" /></StrictMode>,
    )

    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledOnce())
    expect(api.createGenerationTask).toHaveBeenCalledWith('future-city', prompt, 'street-level')
    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'future-city',
      prompt,
      parentImageId: 'street-level',
      referenceImages: [{ imageId: 'street-level', name: '喜羊羊' }],
      transparentBackground: false,
    }))

    rerender(<StrictMode><ChatGptGenerationPanel projectId="future-city" /></StrictMode>)
    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledOnce())
  })

  it('does not create an orphan task when a quick action arrives after panel remount during generation', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    const first = render(<ChatGptGenerationPanel projectId="future-city" />)
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '第一张图')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))
    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledOnce())
    first.unmount()

    const quickPrompt = '@喜羊羊 移除此图像的背景。保持所有前景主体不变且完整无损，边缘干净平滑。将背景设为透明。'
    useGenerationStore.getState().enqueueQuickAction({
      projectId: 'future-city', prompt: quickPrompt,
      referenceImages: [{ imageId: 'street-level', name: '喜羊羊' }],
      transparentBackground: false,
    })
    render(<ChatGptGenerationPanel projectId="future-city" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('当前有图片正在生成，请完成或取消后再试。')
    expect(api.createGenerationTask).toHaveBeenCalledOnce()
    expect(bridge.startGeneration).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue(quickPrompt)
  })

  it('cancels the created backend task and releases the guard when desktop start fails', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    vi.mocked(bridge.startGeneration).mockRejectedValueOnce(new Error('窗口不可用'))
    vi.mocked(api.cancelGenerationTask).mockResolvedValue({
      id: 'task-1', project_id: 'future-city', provider: 'chatgpt-web', prompt: '一朵花',
      parent_image_id: null, status: 'cancelled', progress_message: 'cancelled', chat_url: null,
      image_id: null, image_ids_json: '[]', provider_mode: 'desktop', error_code: null,
    })
    render(<ChatGptGenerationPanel projectId="future-city" />)

    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(api.cancelGenerationTask).toHaveBeenCalledWith('task-1'))
    expect(useGenerationStore.getState().desktopBusy).toBe(false)
    expect(screen.getByRole('alert')).toHaveTextContent('窗口不可用')
  })

  it('restores a recoverable task after remount and retries collection with its original id', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    const first = render(<ChatGptGenerationPanel projectId="future-city" />)
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))
    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledOnce())
    const listener = vi.mocked(bridge.onGenerationEvent).mock.calls[0][0]

    act(() => listener({
      taskId: 'task-1', state: 'page_changed', message: '页面变化，可重试收集',
      imageIds: [], recoverable: true,
    }))
    expect(useGenerationStore.getState().desktopBusy).toBe(false)
    first.unmount()
    render(<ChatGptGenerationPanel projectId="future-city" />)

    expect(screen.getByRole('status')).toHaveTextContent('需要重新连接')
    expect(screen.getByRole('status')).not.toHaveTextContent('正在生成')
    expect(screen.getByRole('alert')).toHaveTextContent('页面变化，可重试收集')
    const retry = screen.getByRole('button', { name: '重试收集图片' })
    expect(retry).toBeEnabled()
    await user.click(retry)
    expect(bridge.retryCollection).toHaveBeenCalledWith('task-1')
  })

  it('disables retry immediately when a new task replaces an old recoverable task', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="future-city" />)
    await waitFor(() => expect(bridge.onGenerationEvent).toHaveBeenCalledOnce())
    const listener = vi.mocked(bridge.onGenerationEvent).mock.calls[0][0]
    act(() => listener({
      taskId: 'task-old', state: 'page_changed', message: '旧任务可重试',
      imageIds: [], recoverable: true,
    }))
    expect(screen.getByRole('button', { name: '重试收集图片' })).toBeEnabled()

    const prompt = screen.getByRole('textbox', { name: 'Prompt' })
    await user.type(prompt, '开始一个新任务')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))
    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledOnce())

    expect(screen.getByRole('button', { name: '重试收集图片' })).toBeDisabled()
    expect(useGenerationStore.getState().desktopRecoverableTaskId).toBeNull()
    expect(useGenerationStore.getState().desktopEvent).toBeNull()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DesktopBridgeApi } from '../desktop/types'
import { useAppStore } from '../../app/store'
import { useCanvasStore } from '../canvas/store/canvasStore'
import { ChatGptGenerationPanel } from './ChatGptGenerationPanel'
import * as api from './generationApi'

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
  useAppStore.setState({ activeProjectId: 'future-city' })
  useCanvasStore.getState().reset()
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

    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '一朵花')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))

    await waitFor(() => expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', prompt: '一朵花', parentImageId: null,
    })))
  })

  it('reloads the persistent ChatGPT page on request', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="project-1" />)

    await user.click(screen.getByRole('button', { name: '重新加载 ChatGPT 页面' }))

    expect(bridge.reloadChatGpt).toHaveBeenCalledOnce()
  })

  it('uses a project image as an actual generation reference and parent version', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    useCanvasStore.getState().selectNode('future-city', 'city-overview')
    render(<ChatGptGenerationPanel projectId="future-city" />)
    await user.selectOptions(screen.getByRole('combobox', { name: '参考图片' }), 'city-overview')
    await user.type(screen.getByRole('textbox', { name: 'Prompt' }), '基于参考图修改光线')
    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成' }))
    await waitFor(() => expect(api.createGenerationTask).toHaveBeenCalledWith(
      'future-city', '基于参考图修改光线', 'city-overview',
    ))
    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      parentImageId: 'city-overview',
    }))
  })
})

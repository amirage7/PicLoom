import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DesktopBridgeApi } from '../desktop/types'
import { ChatGptGenerationPanel } from './ChatGptGenerationPanel'

function installBridge(): DesktopBridgeApi {
  const bridge: DesktopBridgeApi = {
    getRuntimeStatus: vi.fn(async () => ({ backendOnline: true, chatgptVisible: false })),
    setChatGptView: vi.fn(async () => undefined),
    reloadChatGpt: vi.fn(async () => undefined),
    startGeneration: vi.fn(async () => undefined),
    cancelGeneration: vi.fn(async () => undefined),
    retryCollection: vi.fn(async () => undefined),
    onGenerationEvent: vi.fn(() => () => undefined),
  }
  window.aiImageCanvasDesktop = bridge
  return bridge
}

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

    expect(bridge.startGeneration).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', prompt: '一朵花', parentImageId: null,
    }))
  })

  it('reloads the persistent ChatGPT page on request', async () => {
    const user = userEvent.setup()
    const bridge = installBridge()
    render(<ChatGptGenerationPanel projectId="project-1" />)

    await user.click(screen.getByRole('button', { name: '重新加载 ChatGPT 页面' }))

    expect(bridge.reloadChatGpt).toHaveBeenCalledOnce()
  })
})

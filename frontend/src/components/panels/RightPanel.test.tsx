import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DesktopBridgeApi } from '../../features/desktop/types'
import { RightPanel } from './RightPanel'

function installDesktopBridge(): DesktopBridgeApi {
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

describe('RightPanel', () => {
  it('preserves the ordinary image inspector in browser mode', () => {
    render(<RightPanel id="image-inspector" />)

    expect(screen.getByRole('complementary', { name: '图片详情' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'ChatGPT' })).not.toBeInTheDocument()
  })

  it('offers image and ChatGPT tabs in desktop mode', async () => {
    const user = userEvent.setup()
    installDesktopBridge()
    render(<RightPanel id="image-inspector" />)

    expect(screen.getByRole('tab', { name: '图片详情' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'ChatGPT' }))

    expect(screen.getByRole('tab', { name: 'ChatGPT' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'ChatGPT 生图' })).toBeInTheDocument()
  })

  it('hides the native ChatGPT view when switching back to details', async () => {
    const user = userEvent.setup()
    const bridge = installDesktopBridge()
    render(<RightPanel id="image-inspector" />)
    await user.click(screen.getByRole('tab', { name: 'ChatGPT' }))
    await user.click(screen.getByRole('button', { name: '登录 / 查看 ChatGPT' }))
    await user.click(screen.getByRole('tab', { name: '图片详情' }))

    expect(bridge.setChatGptView).toHaveBeenLastCalledWith({ visible: false })
  })
})

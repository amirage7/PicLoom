import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { useAppStore } from './store'


describe('AI Image Canvas shell', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeProjectId: 'future-city',
      isLeftPanelOpen: true,
      isRightPanelOpen: true,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

  afterEach(() => {
    delete window.aiImageCanvasDesktop
  })
  })

  it('renders the workspace landmarks', () => {
    render(<App />)

    expect(screen.getByRole('navigation', { name: '工作区导航' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '图片详情' })).toBeInTheDocument()
  })

  it('switches the active project from the sidebar', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /^产品概念图 12$/ }))

    expect(screen.getByRole('heading', { name: '产品概念图' })).toBeInTheDocument()
  })

  it('reports when the local backend is offline', async () => {
    render(<App />)

    expect(await screen.findByText('后端离线')).toBeInTheDocument()
  })

  it('opens the desktop ChatGPT tab from the canvas toolbar', async () => {
    const user = userEvent.setup()
    useAppStore.setState({ isRightPanelOpen: false })
    window.aiImageCanvasDesktop = {
      getRuntimeStatus: vi.fn(async () => ({ backendOnline: true, chatgptVisible: false })),
      setChatGptView: vi.fn(async () => undefined),
      reloadChatGpt: vi.fn(async () => undefined),
      startGeneration: vi.fn(async () => undefined),
      cancelGeneration: vi.fn(async () => undefined),
      retryCollection: vi.fn(async () => undefined),
      onGenerationEvent: vi.fn(() => () => undefined),
    }
    render(<App />)

    await user.click(screen.getByRole('button', { name: '使用 ChatGPT 生成图片' }))

    expect(screen.getByRole('tab', { name: 'ChatGPT' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByText('加载 Chrome 扩展')).not.toBeInTheDocument()
  })
})

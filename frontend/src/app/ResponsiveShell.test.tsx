import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { useAppStore } from './store'

function useCompactViewport() {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches: true,
    media: '(max-width: 1179px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

describe('responsive workspace shell', () => {
  beforeEach(() => {
    useCompactViewport()
    useAppStore.setState({
      activeProjectId: 'future-city',
      isLeftPanelOpen: false,
      isRightPanelOpen: false,
    })
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
  })

  it('exposes controlled, mutually exclusive panel drawers', async () => {
    const user = userEvent.setup()
    render(<App />)
    const navigationToggle = screen.getByRole('button', { name: '切换左侧栏' })
    const inspectorToggle = screen.getByRole('button', { name: '切换详情栏' })

    expect(navigationToggle).toHaveAttribute('aria-controls', 'workspace-navigation')
    expect(navigationToggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(navigationToggle)
    expect(screen.getByRole('navigation', { name: '工作区导航' })).toHaveAttribute('id', 'workspace-navigation')
    expect(navigationToggle).toHaveAttribute('aria-expanded', 'true')

    await user.click(inspectorToggle)
    expect(screen.queryByRole('navigation', { name: '工作区导航' })).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: '图片详情' })).toHaveAttribute('id', 'image-inspector')
    expect(inspectorToggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('closes a drawer from the backdrop', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '切换左侧栏' }))
    await user.click(screen.getByRole('button', { name: '关闭侧栏' }))

    expect(screen.queryByRole('navigation', { name: '工作区导航' })).not.toBeInTheDocument()
  })

  it('restores the header trigger after Escape from inside a drawer', async () => {
    const user = userEvent.setup()
    render(<App />)
    const trigger = screen.getByRole('button', { name: '切换详情栏' })

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '关闭图片详情' }))
    await user.click(trigger)
    screen.getByRole('button', { name: '关闭图片详情' }).focus()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(trigger).toHaveFocus())
    expect(screen.queryByRole('complementary', { name: '图片详情' })).not.toBeInTheDocument()
  })
})

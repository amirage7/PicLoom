import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from './store'
import { useResponsivePanels } from './useResponsivePanels'

function mockCompact(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
    matches,
    media: '(max-width: 1179px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

function Harness() {
  const panels = useResponsivePanels()
  return <>
    <button type="button" onClick={(event) => panels.openLeft(event.currentTarget)}>导航触发器</button>
    <button type="button" onClick={(event) => panels.openRight(event.currentTarget)}>详情触发器</button>
    <output aria-label="布局">{panels.isCompact ? 'compact' : 'wide'}</output>
    <output aria-label="导航">{panels.isLeftOpen ? 'open' : 'closed'}</output>
    <output aria-label="详情">{panels.isRightOpen ? 'open' : 'closed'}</output>
    <input aria-label="文本输入" />
  </>
}

describe('useResponsivePanels', () => {
  beforeEach(() => {
    useAppStore.setState({ isLeftPanelOpen: false, isRightPanelOpen: false })
  })

  it('keeps only one overlay open in compact layout', async () => {
    mockCompact(true)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '导航触发器' }))
    expect(screen.getByLabelText('导航')).toHaveTextContent('open')
    await user.click(screen.getByRole('button', { name: '详情触发器' }))

    expect(screen.getByLabelText('导航')).toHaveTextContent('closed')
    expect(screen.getByLabelText('详情')).toHaveTextContent('open')
  })

  it('closes the compact overlay with Escape and restores trigger focus', async () => {
    mockCompact(true)
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '详情触发器' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.getByLabelText('详情')).toHaveTextContent('closed')
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('allows both panels to open in wide layout', async () => {
    mockCompact(false)
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole('button', { name: '导航触发器' }))
    await user.click(screen.getByRole('button', { name: '详情触发器' }))

    expect(screen.getByLabelText('布局')).toHaveTextContent('wide')
    expect(screen.getByLabelText('导航')).toHaveTextContent('open')
    expect(screen.getByLabelText('详情')).toHaveTextContent('open')
  })

  it('toggles compact navigation and inspector with bracket shortcuts', () => {
    mockCompact(true)
    render(<Harness />)

    fireEvent.keyDown(window, { key: '[' })
    expect(screen.getByLabelText('导航')).toHaveTextContent('open')
    fireEvent.keyDown(window, { key: ']' })

    expect(screen.getByLabelText('导航')).toHaveTextContent('closed')
    expect(screen.getByLabelText('详情')).toHaveTextContent('open')
  })

  it('ignores panel shortcuts while editing text', () => {
    mockCompact(true)
    render(<Harness />)
    const input = screen.getByRole('textbox', { name: '文本输入' })
    input.focus()

    fireEvent.keyDown(input, { key: '[' })
    fireEvent.keyDown(input, { key: ']' })

    expect(screen.getByLabelText('导航')).toHaveTextContent('closed')
    expect(screen.getByLabelText('详情')).toHaveTextContent('closed')
  })
})

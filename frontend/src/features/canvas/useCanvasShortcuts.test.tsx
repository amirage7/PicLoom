import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCanvasShortcuts } from './useCanvasShortcuts'

const select = vi.fn()
const pan = vi.fn()
const fit = vi.fn()
const clear = vi.fn()

function Harness() {
  useCanvasShortcuts({ select, pan, fit, clear })
  return <>
    <input aria-label="编辑器" />
    <textarea aria-label="Prompt" />
    <select aria-label="分类"><option>摄影</option></select>
    <button type="button">操作</button>
    <div role="textbox" aria-label="富文本" contentEditable />
  </>
}

function DisabledHarness() {
  useCanvasShortcuts({ select, pan, fit, clear, enabled: false })
  return null
}

describe('useCanvasShortcuts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('routes global tool, fit, and clear shortcuts', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.keyboard('vh0{Escape}')

    expect(select).toHaveBeenCalledOnce()
    expect(pan).toHaveBeenCalledOnce()
    expect(fit).toHaveBeenCalledOnce()
    expect(clear).toHaveBeenCalledOnce()
  })

  it.each(['编辑器', 'Prompt', '分类', '操作', '富文本'])('ignores shortcuts from %s', async (name) => {
    const user = userEvent.setup()
    render(<Harness />)
    const target = screen.getByRole(name === '操作' ? 'button' : name === '分类' ? 'combobox' : 'textbox', { name })
    target.focus()

    await user.keyboard('vh0{Escape}')

    expect(select).not.toHaveBeenCalled()
    expect(pan).not.toHaveBeenCalled()
    expect(fit).not.toHaveBeenCalled()
    expect(clear).not.toHaveBeenCalled()
  })

  it('ignores modified shortcuts', () => {
    render(<Harness />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', metaKey: true, bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '0', altKey: true, bubbles: true }))

    expect(select).not.toHaveBeenCalled()
    expect(pan).not.toHaveBeenCalled()
    expect(fit).not.toHaveBeenCalled()
  })

  it('does not handle shortcuts while a compact panel overlay is open', () => {
    render(<DisabledHarness />)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', bubbles: true }))

    expect(clear).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })
})

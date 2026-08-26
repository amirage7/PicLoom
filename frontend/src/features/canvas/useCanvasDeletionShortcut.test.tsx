import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { useCanvasDeletionShortcut } from './useCanvasDeletionShortcut'

function Harness({ onDelete }: { onDelete: () => void }) {
  useCanvasDeletionShortcut({ onDelete, enabled: true })
  return <textarea aria-label="Prompt" />
}

describe('useCanvasDeletionShortcut', () => {
  it.each(['Delete', 'Backspace'])('routes %s to the selected canvas element', (key) => {
    const onDelete = vi.fn()
    render(<Harness onDelete={onDelete} />)

    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('does not delete while editing text', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<Harness onDelete={onDelete} />)
    screen.getByRole('textbox', { name: 'Prompt' }).focus()

    await user.keyboard('{Delete}{Backspace}')

    expect(onDelete).not.toHaveBeenCalled()
  })
})

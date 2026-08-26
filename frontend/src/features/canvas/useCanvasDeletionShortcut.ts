import { useEffect } from 'react'

interface CanvasDeletionShortcutOptions {
  onDelete: () => void
  enabled?: boolean
}

const editableSelector = 'input, textarea, select, button, [contenteditable="true"]'

export function useCanvasDeletionShortcut({ onDelete, enabled = true }: CanvasDeletionShortcutOptions) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof Element && target.closest(editableSelector)) return
      event.preventDefault()
      onDelete()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, onDelete])
}

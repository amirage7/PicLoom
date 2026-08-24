import { useEffect } from 'react'

interface CanvasShortcutActions {
  select: () => void
  pan: () => void
  fit: () => void
  clear: () => void
  enabled?: boolean
}

const editableSelector = 'input, textarea, select, button, [contenteditable="true"]'

export function useCanvasShortcuts({ select, pan, fit, clear, enabled = true }: CanvasShortcutActions) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof Element && target.closest(editableSelector)) return

      const actions: Record<string, () => void> = {
        v: select,
        h: pan,
        '0': fit,
        Escape: clear,
      }
      const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!action) return
      event.preventDefault()
      action()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clear, enabled, fit, pan, select])
}

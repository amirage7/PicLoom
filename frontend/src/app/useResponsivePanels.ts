import { useEffect, useRef, useState } from 'react'

import { useAppStore } from './store'

const compactQuery = '(max-width: 1179px)'

export function useResponsivePanels() {
  const isLeftOpen = useAppStore((state) => state.isLeftPanelOpen)
  const isRightOpen = useAppStore((state) => state.isRightPanelOpen)
  const setLeftOpen = useAppStore((state) => state.setLeftPanelOpen)
  const setRightOpen = useAppStore((state) => state.setRightPanelOpen)
  const [isCompact, setCompact] = useState(() => globalThis.matchMedia?.(compactQuery).matches ?? false)
  const lastTrigger = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!globalThis.matchMedia) return
    const media = globalThis.matchMedia(compactQuery)
    const update = (event: MediaQueryListEvent | MediaQueryList) => setCompact(event.matches)
    update(media)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const remember = (trigger?: HTMLElement | null) => {
    if (trigger) lastTrigger.current = trigger
  }

  const openLeft = (trigger?: HTMLElement | null) => {
    remember(trigger)
    if (isCompact) setRightOpen(false)
    setLeftOpen(true)
  }

  const openRight = (trigger?: HTMLElement | null) => {
    remember(trigger)
    if (isCompact) setLeftOpen(false)
    setRightOpen(true)
  }

  const toggleLeft = (trigger?: HTMLElement | null) => {
    if (isLeftOpen) {
      setLeftOpen(false)
      return
    }
    openLeft(trigger)
  }

  const toggleRight = (trigger?: HTMLElement | null) => {
    if (isRightOpen) {
      setRightOpen(false)
      return
    }
    openRight(trigger)
  }

  const closePanels = (restoreFocus = true) => {
    if (isCompact) {
      setLeftOpen(false)
      setRightOpen(false)
    }
    if (restoreFocus && lastTrigger.current) {
      const trigger = lastTrigger.current
      window.requestAnimationFrame(() => trigger.focus())
    }
  }

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      const target = event.target
      if (event.key === 'Escape' && isCompact && (isLeftOpen || isRightOpen)) {
        event.preventDefault()
        closePanels()
        return
      }
      const isEditing = target instanceof Element && target.closest('input, textarea, select, button, [contenteditable="true"]')
      if (isEditing || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === '[') {
        event.preventDefault()
        toggleLeft()
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        toggleRight()
        return
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  })

  return { isCompact, isLeftOpen, isRightOpen, openLeft, openRight, toggleLeft, toggleRight, closePanels }
}

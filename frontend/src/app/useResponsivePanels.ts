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
      if (event.key !== 'Escape' || !isCompact || (!isLeftOpen && !isRightOpen)) return
      event.preventDefault()
      closePanels()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  })

  return { isCompact, isLeftOpen, isRightOpen, openLeft, openRight, closePanels }
}

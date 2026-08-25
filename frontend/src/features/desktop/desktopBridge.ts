import type { DesktopBridgeApi, DesktopGenerationEvent } from './types'

export function getDesktopBridge(): DesktopBridgeApi | null {
  return window.aiImageCanvasDesktop ?? null
}

export function subscribeToDesktopGeneration(
  listener: (event: DesktopGenerationEvent) => void,
): () => void {
  const cleanup = getDesktopBridge()?.onGenerationEvent(listener) ?? (() => undefined)
  let subscribed = true
  return () => {
    if (!subscribed) return
    subscribed = false
    cleanup()
  }
}

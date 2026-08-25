import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDesktopBridge, subscribeToDesktopGeneration } from './desktopBridge'
import type { DesktopBridgeApi } from './types'

function fakeBridge(): DesktopBridgeApi {
  return {
    getRuntimeStatus: vi.fn(),
    reloadChatGpt: vi.fn(),
    setChatGptView: vi.fn(),
    startGeneration: vi.fn(),
    cancelGeneration: vi.fn(),
    retryCollection: vi.fn(),
    onGenerationEvent: vi.fn(() => vi.fn()),
  }
}

afterEach(() => {
  delete window.aiImageCanvasDesktop
})

describe('desktop bridge detection', () => {
  it('returns null in ordinary browser mode', () => {
    expect(getDesktopBridge()).toBeNull()
  })

  it('returns the preload bridge in desktop mode', () => {
    const bridge = fakeBridge()
    window.aiImageCanvasDesktop = bridge

    expect(getDesktopBridge()).toBe(bridge)
  })

  it('runs the preload unsubscribe function at most once', () => {
    const cleanup = vi.fn()
    const bridge = fakeBridge()
    vi.mocked(bridge.onGenerationEvent).mockReturnValue(cleanup)
    window.aiImageCanvasDesktop = bridge

    const unsubscribe = subscribeToDesktopGeneration(vi.fn())
    unsubscribe()
    unsubscribe()

    expect(cleanup).toHaveBeenCalledOnce()
  })
})

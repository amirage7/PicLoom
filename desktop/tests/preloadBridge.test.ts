import { describe, expect, it, vi } from 'vitest'

import { createDesktopBridge } from '../src/preloadBridge.js'

describe('preload desktop bridge', () => {
  it('uses fixed channels and removes each event listener at most once', async () => {
    const invoke = vi.fn(async () => undefined)
    const on = vi.fn()
    const removeListener = vi.fn()
    const bridge = createDesktopBridge({ invoke, on, removeListener })

    await bridge.cancelGeneration('task-1')
    const listener = vi.fn()
    await bridge.reloadChatGpt()
    const unsubscribe = bridge.onGenerationEvent(listener)
    unsubscribe()
    unsubscribe()

    expect(invoke).toHaveBeenCalledWith('desktop:cancel-generation', 'task-1')
    expect(on).toHaveBeenCalledOnce()
    expect(invoke).toHaveBeenCalledWith('desktop:reload-chatgpt')
    expect(removeListener).toHaveBeenCalledOnce()
  })

  it('drops malformed main-process events', () => {
    let handler: ((event: unknown, payload: unknown) => void) | undefined
    const listener = vi.fn()
    const bridge = createDesktopBridge({
      invoke: vi.fn(),
      on: (_channel, nextHandler) => { handler = nextHandler },
      removeListener: vi.fn(),
    })
    bridge.onGenerationEvent(listener)

    handler?.({}, { taskId: 'task-1', state: 'made-up', message: '', imageIds: [], recoverable: false })
    handler?.({}, {
      taskId: 'task-1', state: 'ready', message: '已连接', imageIds: [], recoverable: false,
    })

    expect(listener).toHaveBeenCalledOnce()
  })
})

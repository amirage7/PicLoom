import { describe, expect, it, vi } from 'vitest'

import { ChatGptViewController } from '../src/chatgptView.js'

function createHarness() {
  const loadURL = vi.fn(async () => undefined)
  const reload = vi.fn()
  const close = vi.fn()
  const setBounds = vi.fn()
  const addChildView = vi.fn()
  const removeChildView = vi.fn()
  const receivedOptions: unknown[] = []
  const getURL = vi.fn(() => 'https://chatgpt.com/c/test')
  const executeJavaScript = vi.fn(async () => undefined)
  const view = { webContents: { loadURL, reload, close, getURL, executeJavaScript }, setBounds }
  const controller = new ChatGptViewController({
    parent: { addChildView, removeChildView },
    createView(options) {
      receivedOptions.push(options)
      return view
    },
  })
  return {
    controller,
    view,
    loadURL,
    reload,
    close,
    setBounds,
    addChildView,
    removeChildView,
    receivedOptions,
  }
}

describe('ChatGptViewController', () => {
  it('creates a hardened persistent view that starts hidden', () => {
    const { controller, receivedOptions, addChildView } = createHarness()

    expect(receivedOptions).toEqual([{
      webPreferences: {
        partition: 'persist:ai-image-canvas-chatgpt',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    }])
    expect(controller.isVisible()).toBe(false)
    expect(addChildView).not.toHaveBeenCalled()
  })

  it('loads only the ChatGPT home through its explicit method', async () => {
    const { controller, loadURL } = createHarness()

    await controller.loadHome()

    expect(loadURL).toHaveBeenCalledWith('https://chatgpt.com/')
  })

  it('reloads the existing persistent ChatGPT page', () => {
    const { controller, reload } = createHarness()

    controller.reload()

    expect(reload).toHaveBeenCalledOnce()
  })

  it('clamps bounds and does not destroy the view when hidden', () => {
    const { controller, view, close, setBounds, addChildView, removeChildView } = createHarness()

    controller.show({ x: -3.2, y: 12.9, width: 400.7, height: -1 })
    controller.hide()

    expect(addChildView).toHaveBeenCalledWith(view)
    expect(setBounds).toHaveBeenCalledWith({ x: 0, y: 12, width: 400, height: 0 })
    expect(removeChildView).toHaveBeenCalledWith(view)
    expect(close).not.toHaveBeenCalled()
    expect(controller.isVisible()).toBe(false)
  })

  it('adds the same view only once and updates visible bounds', () => {
    const { controller, addChildView, setBounds } = createHarness()

    controller.show({ x: 1, y: 2, width: 300, height: 400 })
    controller.show({ x: 5, y: 6, width: 700, height: 800 })

    expect(addChildView).toHaveBeenCalledOnce()
    expect(setBounds).toHaveBeenLastCalledWith({ x: 5, y: 6, width: 700, height: 800 })
  })

  it('removes and closes the owned view on destroy', () => {
    const { controller, close, removeChildView } = createHarness()
    controller.show({ x: 0, y: 0, width: 100, height: 100 })

    controller.destroy()

    expect(removeChildView).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
  })
})

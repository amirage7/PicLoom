import { describe, expect, it, vi } from 'vitest'

import { attachReferenceFiles } from '../src/chatgpt/referenceAttachment.js'

describe('ChatGPT reference attachment', () => {
  it('sets the local file on ChatGPT file input through Chromium', async () => {
    const sendCommand = vi.fn()
      .mockResolvedValueOnce({ root: { nodeId: 1 } })
      .mockResolvedValueOnce({ nodeId: 9 })
      .mockResolvedValueOnce({})
    const webContents = {
      executeJavaScript: vi.fn(async () => true),
      debugger: {
        isAttached: vi.fn(() => false),
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand,
      },
    }

    await attachReferenceFiles(webContents, ['C:\\Temp\\build.png', 'C:\\Temp\\sheep.png'])

    expect(sendCommand).toHaveBeenNthCalledWith(2, 'DOM.querySelector', {
      nodeId: 1, selector: 'input[type="file"]',
    })
    expect(sendCommand).toHaveBeenNthCalledWith(3, 'DOM.setFileInputFiles', {
      nodeId: 9, files: ['C:\\Temp\\build.png', 'C:\\Temp\\sheep.png'],
    })
    expect(webContents.debugger.detach).toHaveBeenCalledOnce()
  })

  it('opens the add menu and chooses its file item when the input is not mounted yet', async () => {
    const sendCommand = vi.fn()
      .mockResolvedValueOnce({ root: { nodeId: 1 } })
      .mockResolvedValueOnce({ nodeId: 0 })
      .mockResolvedValueOnce({ root: { nodeId: 1 } })
      .mockResolvedValueOnce({ nodeId: 9 })
      .mockResolvedValueOnce({})
    const executeJavaScript = vi.fn(async (_script: string) => true)
    await attachReferenceFiles({
      executeJavaScript,
      debugger: {
        isAttached: vi.fn(() => false), attach: vi.fn(), detach: vi.fn(), sendCommand,
      },
    }, ['C:\\Temp\\reference.png'])

    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('menuitem')
  })

  it('waits for ChatGPT to acknowledge the file upload before returning', async () => {
    let messageListener: ((event: unknown, method: string, params: Record<string, unknown>) => void) | undefined
    const on = vi.fn((_event: string, listener: typeof messageListener) => { messageListener = listener })
    const removeListener = vi.fn()
    const sendCommand = vi.fn(async (method: string) => {
      if (method === 'DOM.getDocument') return { root: { nodeId: 1 } }
      if (method === 'DOM.querySelector') return { nodeId: 9 }
      if (method === 'Network.enable') return {}
      if (method === 'DOM.setFileInputFiles') {
        queueMicrotask(() => messageListener?.({}, 'Network.requestWillBeSent', {
          requestId: 'upload-1',
          request: { method: 'POST', url: 'https://chatgpt.com/backend-api/files' },
        }))
        queueMicrotask(() => messageListener?.({}, 'Network.responseReceived', {
          requestId: 'upload-1', response: { status: 200 },
        }))
        return {}
      }
      return {}
    })

    await attachReferenceFiles({
      executeJavaScript: vi.fn(async () => true),
      debugger: {
        isAttached: vi.fn(() => false), attach: vi.fn(), detach: vi.fn(), sendCommand, on, removeListener,
      },
    }, ['C:\\Temp\\reference.png'])

    expect(sendCommand).toHaveBeenCalledWith('Network.enable')
    expect(on).toHaveBeenCalledWith('message', expect.any(Function))
    expect(removeListener).toHaveBeenCalledWith('message', expect.any(Function))
  })
})

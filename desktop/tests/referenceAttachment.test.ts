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
})

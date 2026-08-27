import { describe, expect, it, vi } from 'vitest'

import {
  attachReferenceFiles,
  hasVisibleAttachmentSignal,
  waitForReferenceAttachment,
} from '../src/chatgpt/referenceAttachment.js'

describe('ChatGPT reference attachment', () => {
  it('waits for ChatGPT to render an attachment before submitting a referenced prompt', async () => {
    const probe = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const wait = vi.fn(async () => undefined)

    await waitForReferenceAttachment(probe, wait)

    expect(probe).toHaveBeenCalledTimes(2)
    expect(wait).toHaveBeenCalledOnce()
  })

  it('does not mistake ChatGPT’s always-visible upload button for an attached reference', () => {
    expect(hasVisibleAttachmentSignal(['Attach files'], 0)).toBe(false)
    expect(hasVisibleAttachmentSignal(['Remove attachment'], 0)).toBe(true)
    expect(hasVisibleAttachmentSignal([], 1)).toBe(true)
  })

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
      nodeId: 1, selector: '[data-aic-reference-target="true"]',
    })
    expect(sendCommand).toHaveBeenNthCalledWith(3, 'DOM.setFileInputFiles', {
      nodeId: 9, files: ['C:\\Temp\\build.png', 'C:\\Temp\\sheep.png'],
    })
    expect(webContents.debugger.detach).toHaveBeenCalledOnce()
  })

  it('targets the file input associated with the current ChatGPT composer', async () => {
    const sendCommand = vi.fn()
      .mockResolvedValueOnce({ root: { nodeId: 1 } })
      .mockResolvedValueOnce({ nodeId: 9 })
      .mockResolvedValueOnce({})
    const executeJavaScript = vi.fn<(script: string) => Promise<unknown>>().mockResolvedValue(true)
    await attachReferenceFiles({
      executeJavaScript,
      debugger: {
        isAttached: vi.fn(() => false), attach: vi.fn(), detach: vi.fn(), sendCommand,
      },
    }, ['C:\\Temp\\reference.png'])

    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('#prompt-textarea')
    expect(sendCommand).toHaveBeenNthCalledWith(2, 'DOM.querySelector', {
      nodeId: 1, selector: '[data-aic-reference-target="true"]',
    })
  })

  it('uses the current composer’s add control only when it must create a file input', async () => {
    const sendCommand = vi.fn()
      .mockResolvedValueOnce({ root: { nodeId: 1 } })
      .mockResolvedValueOnce({ nodeId: 9 })
      .mockResolvedValueOnce({})
    const executeJavaScript = vi.fn<(script: string) => Promise<unknown>>().mockResolvedValue(true)
    await attachReferenceFiles({
      executeJavaScript,
      debugger: {
        isAttached: vi.fn(() => false), attach: vi.fn(), detach: vi.fn(), sendCommand,
      },
    }, ['C:\\Temp\\reference.png'])

    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('trigger?.click()')
  })

  it('does not fall back to an unrelated global file input before opening the composer attachment control', async () => {
    const sendCommand = vi.fn()
      .mockResolvedValueOnce({ root: { nodeId: 1 } })
      .mockResolvedValueOnce({ nodeId: 9 })
      .mockResolvedValueOnce({})
    const executeJavaScript = vi.fn<(script: string) => Promise<unknown>>().mockResolvedValue(true)
    await attachReferenceFiles({
      executeJavaScript,
      debugger: { isAttached: vi.fn(() => false), attach: vi.fn(), detach: vi.fn(), sendCommand },
    }, ['C:\\Temp\\reference.png'])

    expect(executeJavaScript.mock.calls[0]?.[0]).toContain('existingInputs')
  })
})

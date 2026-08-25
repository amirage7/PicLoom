import { describe, expect, it, vi } from 'vitest'
import { runInNewContext } from 'node:vm'

import {
  PromptSubmissionError,
  createPromptSubmissionScript,
  submitPrompt,
} from '../src/chatgpt/promptSubmission.js'


describe('ChatGPT prompt submission', () => {
  it('rejects blank and oversized prompts before touching the page', async () => {
    const webContents = {
      executeJavaScript: vi.fn(),
      getURL: vi.fn(() => 'https://chatgpt.com/'),
    }

    await expect(submitPrompt(webContents, '   ')).rejects.toMatchObject({ code: 'invalid_prompt' })
    await expect(submitPrompt(webContents, '花'.repeat(20_001))).rejects.toMatchObject({ code: 'invalid_prompt' })
    expect(webContents.executeJavaScript).not.toHaveBeenCalled()
  })

  it('reports login and changed-page states distinctly', async () => {
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce({ kind: 'login_required' })
      .mockResolvedValueOnce({ kind: 'composer_missing' })
    const webContents = {
      executeJavaScript,
      getURL: vi.fn(() => 'https://chatgpt.com/'),
    }

    await expect(submitPrompt(webContents, 'one')).rejects.toMatchObject({ code: 'login_required' })
    await expect(submitPrompt(webContents, 'two')).rejects.toMatchObject({ code: 'page_changed' })
  })

  it('returns the pre-submit assistant response boundary', async () => {
    const executeJavaScript = vi.fn(async () => ({
      kind: 'submitted',
      assistantResponseIdsBefore: ['assistant-1', 'assistant-2'],
      imageSourcesBefore: ['https://chatgpt.com/existing.webp'],
    }))
    const webContents = {
      executeJavaScript,
      getURL: vi.fn(() => 'https://chatgpt.com/c/example'),
    }

    const receipt = await submitPrompt(webContents, 'a quiet paper knight')

    expect(receipt).toMatchObject({
      conversationUrlBefore: 'https://chatgpt.com/c/example',
      assistantResponseIdsBefore: ['assistant-1', 'assistant-2'],
      imageSourcesBefore: ['https://chatgpt.com/existing.webp'],
    })
    expect(receipt.submittedAt).toEqual(expect.any(Number))
    expect(executeJavaScript).toHaveBeenCalledOnce()
  })


  it('waits for the send button to become enabled and confirms the click', async () => {
    const button = {
      disabled: true,
      clicked: false,
      getAttribute: () => null,
      click() {
        this.clicked = true
        composer.textContent = ''
      },
    }
    const composer = {
      textContent: '',
      focus: vi.fn(),
      getAttribute: (name: string) => name === 'contenteditable' ? 'true' : null,
      dispatchEvent(event: { type: string }) {
        if (event.type === 'input') setTimeout(() => { button.disabled = false }, 0)
        return true
      },
    }
    class PageEvent { constructor(readonly type: string) {} }
    const result = await runInNewContext(createPromptSubmissionScript('delayed send'), {
      document: {
        querySelector: (selector: string) => selector.includes('prompt-textarea') ? composer : null,
        querySelectorAll: (selector: string) => selector.includes('send-button') ? [button] : [],
      },
      HTMLTextAreaElement: class {},
      HTMLInputElement: class {},
      Event: PageEvent,
      KeyboardEvent: PageEvent,
      setTimeout,
    })

    expect(button.clicked).toBe(true)
    expect(result).toMatchObject({ kind: 'submitted' })
    expect(result).toMatchObject({ imageSourcesBefore: [] })
  })
  it('uses native value setters and verifies a real send instead of claiming an Enter fallback', () => {
    const script = createPromptSubmissionScript('a "quoted" prompt')

    expect(script).toContain('HTMLTextAreaElement')
    expect(script).toMatch(/new Event\(["']input["']/)
    expect(script).toMatch(/new Event\(["']change["']/)
    expect(script).toContain('sendButton.click()')
    expect(script).toContain('submission_unconfirmed')
    expect(script).not.toContain('new KeyboardEvent')
    expect(script).toContain('a \\"quoted\\" prompt')
    expect(script).not.toMatch(/cookie|localStorage|sessionStorage/i)
  })

  it('exposes stable machine-readable error codes', () => {
    expect(new PromptSubmissionError('page_changed', 'missing').code).toBe('page_changed')
  })
})

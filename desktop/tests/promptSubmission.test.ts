import { describe, expect, it, vi } from 'vitest'

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
    }))
    const webContents = {
      executeJavaScript,
      getURL: vi.fn(() => 'https://chatgpt.com/c/example'),
    }

    const receipt = await submitPrompt(webContents, 'a quiet paper knight')

    expect(receipt).toMatchObject({
      conversationUrlBefore: 'https://chatgpt.com/c/example',
      assistantResponseIdsBefore: ['assistant-1', 'assistant-2'],
    })
    expect(receipt.submittedAt).toEqual(expect.any(Number))
    expect(executeJavaScript).toHaveBeenCalledOnce()
  })

  it('uses native value setters, input events, send click, and a guarded Enter fallback', () => {
    const script = createPromptSubmissionScript('a "quoted" prompt')

    expect(script).toContain('HTMLTextAreaElement')
    expect(script).toMatch(/new Event\(["']input["']/)
    expect(script).toMatch(/new Event\(["']change["']/)
    expect(script).toContain('sendButton.click()')
    expect(script).toMatch(/new KeyboardEvent\(["']keydown["']/)
    expect(script).toContain('a \\"quoted\\" prompt')
    expect(script).not.toMatch(/cookie|localStorage|sessionStorage/i)
  })

  it('exposes stable machine-readable error codes', () => {
    expect(new PromptSubmissionError('page_changed', 'missing').code).toBe('page_changed')
  })
})

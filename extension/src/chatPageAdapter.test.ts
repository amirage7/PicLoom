// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { ChatPageAdapter, PageAdapterError } from './chatPageAdapter'


function fixture(name: string) {
  return readFileSync(resolve(process.cwd(), 'test/fixtures', name), 'utf8')
}


describe('ChatPageAdapter', () => {
  it('detects a logged-out page', () => {
    document.body.innerHTML = fixture('logged-out.html')
    expect(new ChatPageAdapter(document).getState()).toBe('login-required')
  })

  it('submits a prompt exactly once through the composer', () => {
    document.body.innerHTML = fixture('chat-ready.html')
    const submit = document.querySelector<HTMLButtonElement>('[data-testid="send-button"]')!
    const click = vi.spyOn(submit, 'click')
    const adapter = new ChatPageAdapter(document)

    adapter.submitPrompt('quiet observatory')

    expect(document.querySelector('[data-testid="prompt-textarea"]')?.textContent).toBe('quiet observatory')
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('recognizes generation, rejection, and completed images', () => {
    document.body.innerHTML = fixture('generating.html')
    expect(new ChatPageAdapter(document).getState()).toBe('generating')
    document.body.innerHTML = fixture('rejected.html')
    expect(new ChatPageAdapter(document).getState()).toBe('rejected')
    document.body.innerHTML = fixture('image-result.html')
    expect(new ChatPageAdapter(document).findCompletedImage()?.src).toBe('https://chatgpt.com/result.png')
  })

  it('refuses to click an unsupported page', () => {
    document.body.innerHTML = '<main></main>'
    expect(() => new ChatPageAdapter(document).submitPrompt('prompt')).toThrow(PageAdapterError)
  })
})

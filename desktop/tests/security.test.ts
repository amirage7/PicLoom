import { describe, expect, it, vi } from 'vitest'

import {
  installSessionSecurity,
  isAllowedChatGptUrl,
  isAllowedLoginUrl,
  isAllowedRendererUrl,
} from '../src/security.js'

describe('desktop URL policy', () => {
  it.each([
    'http://127.0.0.1:3000/',
    'http://127.0.0.1:8000/api/health',
    'file:///C:/Program%20Files/AI%20Image%20Canvas/index.html',
  ])('allows renderer URL %s', (url) => {
    expect(isAllowedRendererUrl(url)).toBe(true)
  })

  it.each([
    'http://localhost:3000/',
    'http://192.168.1.2:3000/',
    'https://example.com/',
    'javascript:alert(1)',
    'data:text/html,hello',
  ])('rejects renderer URL %s', (url) => {
    expect(isAllowedRendererUrl(url)).toBe(false)
  })

  it.each([
    'https://chatgpt.com/',
    'https://chatgpt.com/c/abc',
    'https://auth.openai.com/authorize',
    'https://accounts.openai.com/login',
  ])('allows ChatGPT navigation URL %s', (url) => {
    expect(isAllowedChatGptUrl(url)).toBe(true)
  })

  it.each([
    'http://chatgpt.com/',
    'https://chatgpt.com.evil.example/',
    'file:///C:/secrets.txt',
    'javascript:alert(1)',
  ])('rejects ChatGPT navigation URL %s', (url) => {
    expect(isAllowedChatGptUrl(url)).toBe(false)
  })

  it('limits login navigation to OpenAI HTTPS hosts', () => {
    expect(isAllowedLoginUrl('https://openai.com/')).toBe(true)
    expect(isAllowedLoginUrl('https://auth.openai.com/')).toBe(true)
    expect(isAllowedLoginUrl('https://openai.com.evil.example/')).toBe(false)
    expect(isAllowedLoginUrl('http://auth.openai.com/')).toBe(false)
  })
})

describe('session security', () => {
  it('denies permissions and unexpected downloads by default', () => {
    let requestHandler: ((webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void) | undefined
    let checkHandler: ((webContents: unknown, permission: string) => boolean) | undefined
    let downloadHandler: ((event: { preventDefault(): void }) => void) | undefined
    const preventDefault = vi.fn()
    const session = {
      setPermissionRequestHandler(handler: typeof requestHandler) { requestHandler = handler },
      setPermissionCheckHandler(handler: typeof checkHandler) { checkHandler = handler },
      on(name: string, handler: typeof downloadHandler) {
        if (name === 'will-download') downloadHandler = handler
      },
    }

    const policy = installSessionSecurity(session)
    const callback = vi.fn()
    requestHandler?.({}, 'camera', callback)

    expect(callback).toHaveBeenCalledWith(false)
    expect(checkHandler?.({}, 'clipboard-read')).toBe(false)
    downloadHandler?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()

    policy.allowNextDownload()
    preventDefault.mockClear()
    downloadHandler?.({ preventDefault })
    expect(preventDefault).not.toHaveBeenCalled()
  })
})

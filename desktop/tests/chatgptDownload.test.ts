import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import {
  ImageCollectionError,
  collectChatGptImages,
  type ImageSource,
} from '../src/chatgpt/download.js'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3,
])

function response(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status })
}

function pageResult(bytes: Uint8Array, status = 200): unknown {
  return {
    ok: status >= 200 && status < 300,
    status,
    base64: Buffer.from(bytes).toString('base64'),
  }
}

function sources(...urls: string[]): ImageSource[] {
  return urls.map((src, order) => ({ src, order }))
}

describe('authenticated ChatGPT image collection', () => {
  it('collects data, blob, and protected HTTPS sources in stable page order', async () => {
    const dataUrl = `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`
    const executeJavaScript = vi.fn()
      .mockResolvedValueOnce(pageResult(JPEG))
      .mockResolvedValueOnce(pageResult(WEBP))
    const sessionFetch = vi.fn(async () => response(Uint8Array.from([0x3c, 0x68, 0x74, 0x6d, 0x6c]), 403))

    const images = await collectChatGptImages(
      sources(dataUrl, 'blob:https://chatgpt.com/id', 'https://files.oaiusercontent.com/image.webp'),
      { executeJavaScript },
      { sessionFetch },
    )

    expect(images.map(({ order, mimeType }) => ({ order, mimeType }))).toEqual([
      { order: 0, mimeType: 'image/png' },
      { order: 1, mimeType: 'image/jpeg' },
      { order: 2, mimeType: 'image/webp' },
    ])
    expect(images.map((image) => [...image.bytes])).toEqual([[...PNG], [...JPEG], [...WEBP]])
    expect(executeJavaScript).toHaveBeenCalledTimes(2)
  })

  it('prefers main-process session fetch for ordinary HTTPS', async () => {
    const executeJavaScript = vi.fn()
    const sessionFetch = vi.fn(async () => response(PNG))

    const images = await collectChatGptImages(
      sources('https://chatgpt.com/backend-api/files/image.png'),
      { executeJavaScript },
      { sessionFetch },
    )

    expect(images[0]?.sha256).toBe(createHash('sha256').update(PNG).digest('hex'))
    expect(sessionFetch).toHaveBeenCalledOnce()
    expect(executeJavaScript).not.toHaveBeenCalled()
  })

  it('sniffs bytes and rejects HTML even when the URL looks like an image', async () => {
    const sessionFetch = vi.fn(async () => response(new TextEncoder().encode('<html>login</html>')))

    await expect(collectChatGptImages(
      sources('https://chatgpt.com/fake.png'),
      { executeJavaScript: vi.fn() },
      { sessionFetch },
    )).rejects.toMatchObject({ code: 'unsupported_image' })
  })

  it('rejects unauthorized responses when page-context fallback is also unauthorized', async () => {
    await expect(collectChatGptImages(
      sources('https://chatgpt.com/protected.png'),
      { executeJavaScript: vi.fn(async () => pageResult(PNG, 401)) },
      { sessionFetch: vi.fn(async () => response(PNG, 403)) },
    )).rejects.toMatchObject({ code: 'unauthorized' })
  })

  it('deduplicates by content hash while preserving the first occurrence', async () => {
    const sessionFetch = vi.fn()
      .mockResolvedValueOnce(response(PNG))
      .mockResolvedValueOnce(response(JPEG))
      .mockResolvedValueOnce(response(PNG))

    const images = await collectChatGptImages(
      sources('https://example.com/first', 'https://example.com/second', 'https://example.com/duplicate'),
      { executeJavaScript: vi.fn() },
      { sessionFetch },
    )

    expect(images.map((image) => image.order)).toEqual([0, 1])
  })

  it('enforces per-image and total byte limits', async () => {
    const oversized = new Uint8Array(21 * 1024 * 1024)
    oversized.set(PNG.subarray(0, 8))
    await expect(collectChatGptImages(
      sources('data:image/png;base64,' + Buffer.from(oversized).toString('base64')),
      { executeJavaScript: vi.fn() },
      { sessionFetch: vi.fn() },
    )).rejects.toMatchObject({ code: 'image_too_large' })

    const seventeenMb = new Uint8Array(17 * 1024 * 1024)
    seventeenMb.set(PNG.subarray(0, 8))
    let call = 0
    const sessionFetch = vi.fn(async () => {
      const unique = seventeenMb.slice()
      unique[unique.length - 1] = call++
      return response(unique)
    })
    await expect(collectChatGptImages(
      sources(...Array.from({ length: 5 }, (_, index) => `https://example.com/${index}`)),
      { executeJavaScript: vi.fn() },
      { sessionFetch },
    )).rejects.toMatchObject({ code: 'batch_too_large' })
  })

  it('times out stalled fetches and supports caller cancellation', async () => {
    vi.useFakeTimers()
    const never = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const timedOut = collectChatGptImages(
      sources('https://example.com/slow'),
      { executeJavaScript: vi.fn() },
      { sessionFetch: never, timeoutMs: 50 },
    )
    const timeoutResult = timedOut.catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(60)
    expect(await timeoutResult).toMatchObject({ code: 'timeout' })

    const controller = new AbortController()
    controller.abort()
    await expect(collectChatGptImages(
      sources('https://example.com/cancel'),
      { executeJavaScript: vi.fn() },
      { sessionFetch: never, signal: controller.signal },
    )).rejects.toMatchObject({ code: 'cancelled' })
    vi.useRealTimers()
  })

  it('uses stable machine-readable collection errors', () => {
    expect(new ImageCollectionError('timeout', 'late').code).toBe('timeout')
  })
})

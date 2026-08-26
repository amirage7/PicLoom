import { describe, expect, it, vi } from 'vitest'

import { GenerationBackendClient } from '../src/generationBackendClient.js'

describe('generation backend client', () => {
  it('patches desktop state and sends ordered images in one multipart request', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('{}'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ image_ids: ['one', 'two'] })))
    const client = new GenerationBackendClient('http://127.0.0.1:8001', request)

    await client.updateState('task one', 'collecting', 'collecting', 'https://chatgpt.com/c/test')
    const result = await client.completeBatch({
      taskId: 'task one',
      batchId: 'batch-1',
      sourceUrl: 'https://chatgpt.com/c/test',
      suggestedNames: ['云端机甲', '苍穹机甲'],
      images: [
        { order: 1, sourceUrl: 'blob:2', mimeType: 'image/webp', sha256: 'b', bytes: Uint8Array.of(2) },
        { order: 0, sourceUrl: 'blob:1', mimeType: 'image/png', sha256: 'a', bytes: Uint8Array.of(1) },
      ],
    })

    expect(request.mock.calls[0]?.[0]).toContain('/task%20one/desktop-state')
    const multipart = request.mock.calls[1]?.[1]?.body as FormData
    expect(multipart.getAll('files').map((file) => (file as File).name)).toEqual([
      'chatgpt-1.png', 'chatgpt-2.webp',
    ])
    expect(multipart.get('suggested_names')).toBe(JSON.stringify(['云端机甲', '苍穹机甲']))
    expect(result.imageIds).toEqual(['one', 'two'])
  })

  it('omits an empty suggested name list from the multipart request', async () => {
    const request = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => (
      new Response(JSON.stringify({ image_ids: ['one'] }))
    ))
    const client = new GenerationBackendClient('http://127.0.0.1:8001', request)

    await client.completeBatch({
      taskId: 'task-1', batchId: 'batch-1', sourceUrl: 'https://chatgpt.com/c/test',
      suggestedNames: ['', '   '],
      images: [{ order: 0, sourceUrl: 'blob:1', mimeType: 'image/png', sha256: 'a', bytes: Uint8Array.of(1) }],
    })

    const multipart = request.mock.calls[0]?.[1]?.body as FormData
    expect(multipart.has('suggested_names')).toBe(false)
  })

  it('surfaces backend detail without exposing request bodies', async () => {
    const client = new GenerationBackendClient('http://127.0.0.1:8001', vi.fn(async () => (
      new Response(JSON.stringify({ detail: 'invalid transition' }), { status: 409 })
    )))

    await expect(client.cancel('task-1')).rejects.toThrow('invalid transition')
  })

  it('downloads a stored image for ChatGPT attachment and local saving', async () => {
    const request = vi.fn(async () => new Response(Uint8Array.of(1, 2, 3), {
      headers: { 'Content-Disposition': 'attachment; filename="reference.png"' },
    }))
    const client = new GenerationBackendClient('http://127.0.0.1:8001', request)
    const result = await client.getImageFile('image one')
    expect(request).toHaveBeenCalledWith(
      'http://127.0.0.1:8001/api/images/image%20one/content',
      expect.objectContaining({ headers: { Accept: 'image/*' } }),
    )
    expect(result.fileName).toBe('reference.png')
    expect([...result.bytes]).toEqual([1, 2, 3])
  })
})

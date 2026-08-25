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
    expect(result.imageIds).toEqual(['one', 'two'])
  })

  it('surfaces backend detail without exposing request bodies', async () => {
    const client = new GenerationBackendClient('http://127.0.0.1:8001', vi.fn(async () => (
      new Response(JSON.stringify({ detail: 'invalid transition' }), { status: 409 })
    )))

    await expect(client.cancel('task-1')).rejects.toThrow('invalid transition')
  })
})

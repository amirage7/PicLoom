import { afterEach, describe, expect, it, vi } from 'vitest'

import { listProjects, uploadImage } from './resourcesApi'


const project = {
  id: 'future-city',
  name: '未来城市设计',
  created_time: '2026-08-18T01:00:00Z',
  image_count: 0,
}

describe('resourcesApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads typed project resources', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([project]))))

    await expect(listProjects()).resolves.toEqual([project])
    expect(fetch).toHaveBeenCalledWith('/api/projects', expect.objectContaining({ headers: expect.any(Headers) }))
  })

  it('uploads an image as multipart data', async () => {
    const response = { id: 'image-1', project_id: 'future-city', image_url: '/media/image.png' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 201 })))
    const file = new File(['image'], 'image.png', { type: 'image/png' })

    await uploadImage('future-city', file, { prompt: 'City', positionX: 10, positionY: 20 })

    expect(fetch).toHaveBeenCalledWith(
      '/api/projects/future-city/images',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    )
    const options = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect(new Headers(options.headers).has('Content-Type')).toBe(false)
  })

  it('surfaces the backend detail message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: '非法图片' }), { status: 400 }),
    ))

    await expect(listProjects()).rejects.toThrow('非法图片')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchNextTask, pairExtension } from './bridgeClient'


const storageGet = vi.fn()
const storageSet = vi.fn()

vi.stubGlobal('chrome', {
  runtime: { getManifest: () => ({ version: '0.1.0' }) },
  storage: { local: { get: storageGet, set: storageSet } },
})


describe('bridge client', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    storageGet.mockReset()
    storageSet.mockReset()
  })

  it('persists the token returned by successful pairing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: 'local-token' }), { status: 200 }),
    ))

    await pairExtension('123456')

    expect(storageSet).toHaveBeenCalledWith({ bridgeToken: 'local-token' })
  })

  it('never requests a task without a token', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    storageGet.mockResolvedValue({})

    await expect(fetchNextTask()).rejects.toThrow('扩展尚未配对')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

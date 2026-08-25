import { describe, expect, it } from 'vitest'

import { localBackendUrl } from './localBackend'

describe('local backend URL', () => {
  it('keeps relative loopback-proxied URLs in browser development', () => {
    expect(localBackendUrl('/api/health')).toBe('/api/health')
  })

  it('targets the supervised loopback backend from a packaged file renderer', () => {
    expect(localBackendUrl('/api/health', 'file:')).toBe('http://127.0.0.1:8001/api/health')
  })

  it('rejects paths that could escape the local backend routing rule', () => {
    expect(() => localBackendUrl('https://example.com')).toThrow('must be absolute')
  })
})

import { describe, expect, it } from 'vitest'

import { validateImageFiles } from './files'


describe('validateImageFiles', () => {
  it('accepts png, jpeg, and webp files', () => {
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
      new File(['c'], 'c.webp', { type: 'image/webp' }),
    ]

    expect(validateImageFiles(files)).toEqual({ valid: files, errors: [] })
  })

  it('rejects unsupported and oversized files', () => {
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' })
    const large = new File(
      [new Uint8Array(20 * 1024 * 1024 + 1)],
      'large.png',
      { type: 'image/png' },
    )

    const result = validateImageFiles([text, large])

    expect(result.valid).toEqual([])
    expect(result.errors).toEqual([
      'notes.txt：仅支持 PNG、JPG 和 WEBP',
      'large.png：文件不能超过 20MB',
    ])
  })

  it('accepts only the first twenty valid files', () => {
    const files = Array.from(
      { length: 21 },
      (_, index) => new File(['x'], `${index}.png`, { type: 'image/png' }),
    )

    const result = validateImageFiles(files)

    expect(result.valid).toHaveLength(20)
    expect(result.errors).toEqual(['一次最多添加 20 张图片'])
  })
})

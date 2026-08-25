import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CHATGPT_ADAPTER_VERSION,
  createInspectPageScript,
  inspectFixtureHtml,
} from '../src/chatgpt/adapter.js'


function fixture(name: string): string {
  return readFileSync(path.resolve('tests/fixtures/chatgpt', name), 'utf8')
}

describe('versioned ChatGPT page adapter', () => {
  it('detects a signed-out page', () => {
    expect(inspectFixtureHtml(fixture('logged-out.html'), [])).toEqual({
      kind: 'login_required',
      reason: 'ChatGPT login is required',
    })
  })

  it('detects an available composer', () => {
    expect(inspectFixtureHtml(fixture('ready-empty-chat.html'), [])).toEqual({ kind: 'ready' })
  })

  it('detects active generation', () => {
    expect(inspectFixtureHtml(fixture('generating.html'), [])).toEqual({ kind: 'generating' })
  })

  it('collects only generated images from assistant responses after the boundary', () => {
    expect(inspectFixtureHtml(fixture('completed-two-images.html'), ['assistant-old'])).toEqual({
      kind: 'completed',
      images: [
        { src: 'blob:https://chatgpt.com/result-one', alt: 'Generated image one' },
        { src: 'https://chatgpt.com/backend-api/files/result-two.webp', alt: 'Generated image two' },
      ],
    })
  })

  it('detects a new large result image without legacy ChatGPT labels', () => {
    const inspectWithImageBaseline = inspectFixtureHtml as (
      html: string, assistantIds: string[], imageSources: string[]
    ) => ReturnType<typeof inspectFixtureHtml>

    expect(inspectWithImageBaseline(
      fixture('completed-unmarked-large-image.html'),
      [],
      ['https://chatgpt.com/existing.webp'],
    )).toEqual({
      kind: 'completed',
      images: [{ src: 'https://files.oaiusercontent.com/new-result.webp', alt: '' }],
    })
  })

  it('distinguishes refusal, rate limit, and unknown layouts', () => {
    expect(inspectFixtureHtml(fixture('refusal.html'), [])).toEqual({
      kind: 'refused',
      reason: 'The request was refused',
    })
    expect(inspectFixtureHtml(fixture('rate-limit.html'), [])).toEqual({
      kind: 'rate_limited',
      reason: 'ChatGPT usage limit reached',
    })
    expect(inspectFixtureHtml(fixture('unknown-layout.html'), [])).toMatchObject({
      kind: 'page_changed',
    })
  })

  it('emits a serializable page script without session-secret access', () => {
    const script = createInspectPageScript(['assistant-old'])

    expect(CHATGPT_ADAPTER_VERSION).toBe('2026-08-25.2')
    expect(script).toContain('assistant-old')
    expect(script).not.toMatch(/cookie|localStorage|sessionStorage/i)
    expect(JSON.parse(JSON.stringify(inspectFixtureHtml(
      fixture('completed-two-images.html'),
      ['assistant-old'],
    )))).toMatchObject({ kind: 'completed' })
  })
})

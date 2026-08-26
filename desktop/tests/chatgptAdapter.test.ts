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

  it('extracts a suggested name only from the latest new Assistant response', () => {
    const html = `
      <article data-message-author-role="assistant" data-message-id="assistant-old">
        <p>图片名称：旧名称</p>
        <img data-testid="generated-image" src="https://example.test/old.png" alt="Generated image old" />
      </article>
      <article data-message-author-role="user"><p>@用户引用 图片名称：错误名称</p></article>
      <article data-message-author-role="assistant" data-message-id="assistant-new">
        <p>创作完成。</p><p>图片名称：云端机甲</p>
        <img data-testid="generated-image" src="https://example.test/final.png" alt="Generated image" />
      </article>
      <div id="prompt-textarea"></div>
    `

    expect(inspectFixtureHtml(html, ['assistant-old'])).toEqual({
      kind: 'completed',
      images: [{ src: 'https://example.test/final.png', alt: 'Generated image' }],
      suggestedName: '云端机甲',
    })
  })

  it('stitches a suggested name across a soft-wrap newline in the rendered text', () => {
    const html = `
      <article data-message-author-role="assistant" data-message-id="assistant-new">
        <p>图片名称：创骑喜<br/>羊羊</p>
        <img data-testid="generated-image" src="https://example.test/wrap.png" alt="Generated image wrap" />
      </article>
      <div id="prompt-textarea"></div>
    `

    expect(inspectFixtureHtml(html, [])).toMatchObject({
      kind: 'completed',
      suggestedName: '创骑喜羊羊',
    })
  })

  it('keeps image completion valid when ChatGPT omits the suggested name', () => {
    const result = inspectFixtureHtml(fixture('completed-two-images.html'), ['assistant-old'])

    expect(result).toMatchObject({ kind: 'completed' })
    expect(result).not.toHaveProperty('suggestedName')
  })

  it('ignores new user attachment previews when an unmarked assistant image appears', () => {
    expect(inspectFixtureHtml(
      fixture('completed-unmarked-assistant-with-user-previews.html'),
      ['assistant-old'],
      [],
    )).toEqual({
      kind: 'completed',
      images: [{ src: 'https://files.oaiusercontent.com/final-composite.webp', alt: '' }],
    })
  })

  it('does not import an image from an earlier new response when the latest response has no image', () => {
    expect(inspectFixtureHtml(
      fixture('latest-assistant-response-has-no-image.html'),
      ['assistant-old'],
      [],
    )).toEqual({ kind: 'ready' })
  })

  it('keeps an idless assistant response in the baseline by its assistant index', () => {
    expect(inspectFixtureHtml(
      fixture('old-idless-assistant-with-image.html'),
      ['assistant-index-0'],
      [],
    )).toEqual({ kind: 'ready' })
  })

  it('detects the final new image when ChatGPT renders it outside the Assistant message', () => {
    expect(inspectFixtureHtml(
      fixture('completed-result-outside-assistant.html'),
      [],
      ['https://files.oaiusercontent.com/reference-preview.webp'],
    )).toEqual({
      kind: 'completed',
      images: [{ src: 'https://files.oaiusercontent.com/transparent-result.webp', alt: '' }],
      suggestedName: '透明机甲',
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

    expect(CHATGPT_ADAPTER_VERSION).toBe('2026-08-26.1')
    expect(script).toContain('assistant-old')
    expect(script).toContain('newResponses.at(-1)')
    expect(script).toContain('assistant-index-${index}')
    expect(script).toContain('Adapter 2026-08-26.1: composer not found')
    expect(script).not.toContain('Adapter 2026-08-25.2: composer not found')
    expect(script).not.toMatch(/cookie|localStorage|sessionStorage/i)
    expect(JSON.parse(JSON.stringify(inspectFixtureHtml(
      fixture('completed-two-images.html'),
      ['assistant-old'],
    )))).toMatchObject({ kind: 'completed' })
  })
})

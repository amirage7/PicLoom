import { describe, expect, it, vi } from 'vitest'

import {
  buildImageNamingPrompt,
  IMAGE_NAMING_PROMPT,
  inspectImageNameFixtureHtml,
  requestChatGptImageNames,
  type ImageNamePageState,
  type NamingDependencies,
} from '../src/chatgpt/imageNaming.js'

describe('ChatGPT image naming', () => {
  it('extracts a formatted name only from the latest Assistant reply after the boundary', () => {
    const html = `
      <article data-message-author-role="assistant" data-message-id="old"><p>图片名称：旧名称</p></article>
      <article data-message-author-role="user"><p>图片名称：错误名称</p></article>
      <article data-message-author-role="assistant" data-message-id="new"><p>图片名称：透明机甲</p></article>
      <div id="prompt-textarea"></div>
    `

    expect(inspectImageNameFixtureHtml(html, ['old'])).toEqual({
      kind: 'completed',
      name: '透明机甲',
      names: ['透明机甲'],
    })
  })

  it('stitches a name across a soft-wrap newline in the rendered text', () => {
    // 复现 ChatGPT 详情面板里名字被 innerText 软换行截断的情形（创骑喜\n羊羊 → 创骑喜羊羊）。
    const html = `
      <article data-message-author-role="assistant" data-message-id="new">
        <p>图片名称：创骑喜<br/>羊羊</p>
      </article>
      <div id="prompt-textarea"></div>
    `

    expect(inspectImageNameFixtureHtml(html, [])).toEqual({
      kind: 'completed',
      name: '创骑喜羊羊',
      names: ['创骑喜羊羊'],
    })
  })

  it('stops at a paragraph break and does not swallow following prose', () => {
    const html = `
      <article data-message-author-role="assistant" data-message-id="new">
        <p>图片名称：透明机甲</p>
        <p>接下来还有别的解释段，不能并进名字。</p>
      </article>
      <div id="prompt-textarea"></div>
    `

    expect(inspectImageNameFixtureHtml(html, [])).toEqual({
      kind: 'completed',
      name: '透明机甲',
      names: ['透明机甲'],
    })
  })

  it('extracts numbered names for a multi-image reply in order', () => {
    const html = `
      <article data-message-author-role="assistant" data-message-id="new">
        <p>图片名称1：赤红机甲</p>
        <p>图片名称2：苍蓝机甲</p>
        <p>图片名称3：翠绿机甲</p>
      </article>
      <div id="prompt-textarea"></div>
    `

    expect(inspectImageNameFixtureHtml(html, [])).toEqual({
      kind: 'completed',
      name: '赤红机甲',
      names: ['赤红机甲', '苍蓝机甲', '翠绿机甲'],
    })
  })

  it('builds the same classic prompt for a single image', () => {
    expect(buildImageNamingPrompt(1)).toBe(IMAGE_NAMING_PROMPT)
    expect(buildImageNamingPrompt(0)).toBe(IMAGE_NAMING_PROMPT)
  })

  it('builds a numbered naming prompt for multiple images', () => {
    const prompt = buildImageNamingPrompt(3)
    expect(prompt).toContain('图片名称1：名称1')
    expect(prompt).toContain('图片名称3：名称3')
    expect(prompt).toContain('不得生成或修改图片')
    expect(prompt).not.toBe(IMAGE_NAMING_PROMPT)
  })

  it('submits one text-only prompt and returns the new ChatGPT name', async () => {
    const submit = vi.fn<NamingDependencies['submit']>(async () => ({
      conversationUrlBefore: 'https://chatgpt.com/c/test',
      assistantResponseIdsBefore: ['old'],
      imageSourcesBefore: [],
      submittedAt: 1,
    }))
    const states: ImageNamePageState[] = [
      { kind: 'waiting' },
      { kind: 'completed', name: '透明机甲', names: ['透明机甲'] },
    ]
    const inspect = vi.fn<NamingDependencies['inspect']>(
      async () => states.shift() ?? { kind: 'waiting' },
    )
    let now = 0

    const result = await requestChatGptImageNames(
      { executeJavaScript: vi.fn(), getURL: () => 'https://chatgpt.com/c/test' },
      1,
      new AbortController().signal,
      {
        submit,
        inspect,
        wait: vi.fn(async () => { now += 500 }),
        now: () => now,
      },
    )

    expect(result).toEqual(['透明机甲'])
    expect(submit).toHaveBeenCalledOnce()
    expect(submit.mock.calls[0]?.[1]).toBe(IMAGE_NAMING_PROMPT)
    expect(IMAGE_NAMING_PROMPT).toContain('不得生成或修改图片')
    expect(inspect).toHaveBeenCalledWith(expect.anything(), ['old'])
  })

  it('returns ordered names for a multi-image naming reply', async () => {
    const submit = vi.fn<NamingDependencies['submit']>(async () => ({
      conversationUrlBefore: 'https://chatgpt.com/c/test',
      assistantResponseIdsBefore: [],
      imageSourcesBefore: [],
      submittedAt: 1,
    }))
    const inspect = vi.fn<NamingDependencies['inspect']>(async () => ({
      kind: 'completed',
      name: '赤红机甲',
      names: ['赤红机甲', '苍蓝机甲'],
    }))

    const result = await requestChatGptImageNames(
      { executeJavaScript: vi.fn(), getURL: () => 'https://chatgpt.com/c/test' },
      2,
      new AbortController().signal,
      { submit, inspect, wait: vi.fn(async () => undefined), now: () => 0 },
    )

    expect(result).toEqual(['赤红机甲', '苍蓝机甲'])
    expect(submit.mock.calls[0]?.[1]).toContain('图片名称1：名称1')
  })

  it('returns undefined after 30 seconds without a formatted name', async () => {
    let now = 0
    const result = await requestChatGptImageNames(
      { executeJavaScript: vi.fn(), getURL: () => 'https://chatgpt.com/c/test' },
      1,
      new AbortController().signal,
      {
        submit: vi.fn<NamingDependencies['submit']>(async () => ({
          conversationUrlBefore: 'https://chatgpt.com/c/test',
          assistantResponseIdsBefore: [],
          imageSourcesBefore: [],
          submittedAt: 1,
        })),
        inspect: vi.fn<NamingDependencies['inspect']>(async () => ({ kind: 'waiting' })),
        wait: vi.fn(async () => { now += 5_000 }),
        now: () => now,
      },
    )

    expect(result).toBeUndefined()
    expect(now).toBe(30_000)
  })

  it('propagates cancellation instead of falling back silently', async () => {
    const controller = new AbortController()
    const reason = new Error('cancelled')
    controller.abort(reason)

    await expect(requestChatGptImageNames(
      { executeJavaScript: vi.fn(), getURL: () => 'https://chatgpt.com/c/test' },
      1,
      controller.signal,
      {
        submit: vi.fn(),
        inspect: vi.fn(),
        wait: vi.fn(),
        now: () => 0,
      },
    )).rejects.toBe(reason)
  })
})

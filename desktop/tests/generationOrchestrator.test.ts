import { describe, expect, it, vi } from 'vitest'

import type { DesktopGenerationEvent, DesktopGenerationRequest } from '../src/contracts.js'
import type { PageState } from '../src/chatgpt/adapter.js'
import type { CollectedImage } from '../src/chatgpt/download.js'
import { buildSubmissionPrompt, GenerationOrchestrator } from '../src/generationOrchestrator.js'

const REQUEST: DesktopGenerationRequest = {
  taskId: 'task-1',
  projectId: 'project-1',
  prompt: '一朵花',
  parentImageId: null,
  referenceImages: [],
  transparentBackground: false,
}

describe('ChatGPT submission prompt', () => {
  it('always requests a fixed-format name without changing the user prompt', () => {
    const result = buildSubmissionPrompt('生成一个机器人', [], false)

    expect(result).toContain('生成一个机器人')
    expect(result).toContain('2–12 个字符的简短中文名称')
    expect(result).toContain('图片名称：名称')
    expect(result).not.toContain('背景设为透明')
  })

  it('adds transparent-output constraints only when requested', () => {
    expect(buildSubmissionPrompt('生成一个机器人', [], true)).toContain(
      '将最终图片背景设为透明，保持所有前景主体完整无损，边缘干净平滑。不要添加纯色、白色或棋盘格背景。',
    )
    expect(buildSubmissionPrompt('生成一个机器人', [], false)).not.toContain('背景设为透明')
  })

  it('keeps ordered reference mapping alongside generation constraints', () => {
    const result = buildSubmissionPrompt('组合@甲和@乙', [
      { imageId: 'a', name: '甲' },
      { imageId: 'b', name: '乙' },
    ], true)

    expect(result).toContain('参考图片顺序：第1张“甲”；第2张“乙”。')
    expect(result).toContain('请严格按照用户文本中的 @名称 对应这些附件。')
    expect(result).toContain('组合@甲和@乙')
    expect(result).toContain('背景设为透明')
  })
})

function harness(states: PageState[]) {
  const events: DesktopGenerationEvent[] = []
  const updateState = vi.fn(async (
    _taskId: string,
    _state: DesktopGenerationEvent['state'],
    _message: string,
    _pageUrl: string,
  ) => undefined)
  const completeBatch = vi.fn(async () => ({ imageIds: ['image-1', 'image-2'] }))
  const inspect = vi.fn(async (): Promise<PageState> => states.shift() ?? { kind: 'generating' })
  const submit = vi.fn(async () => ({
    conversationUrlBefore: 'https://chatgpt.com/c/test',
    assistantResponseIdsBefore: ['old-response'],
    imageSourcesBefore: ['https://chatgpt.com/existing.webp'],
    submittedAt: 1,
  }))
  const collect = vi.fn(async (sources: Array<{ src: string; order: number }>): Promise<CollectedImage[]> => (
    sources.map((source) => ({
      order: source.order,
      sourceUrl: source.src,
      mimeType: 'image/png',
      sha256: `sha-${source.order}`,
      bytes: Uint8Array.of(source.order + 1),
    }))
  ))
  const abortableWait = vi.fn(async (_ms: number, signal: AbortSignal) => {
    if (signal.aborted) throw signal.reason
  })
  const cleanupReferences = vi.fn(async () => undefined)
  const attachReferences = vi.fn(async () => cleanupReferences)
  const requestSuggestedName = vi.fn(async (_webContents: unknown, count: number) =>
    Array.from({ length: Math.max(1, count) }, (_, index) => `名${index + 1}`))
  const orchestrator = new GenerationOrchestrator({
    view: {
      loadHome: vi.fn(async () => undefined),
      getUrl: vi.fn(() => 'https://chatgpt.com/c/test'),
      getWebContents: vi.fn(() => ({ executeJavaScript: vi.fn(), getURL: () => 'https://chatgpt.com/c/test' })),
    },
    inspect,
    submit,
    collect,
    attachReferences,
    requestSuggestedName,
    backend: { updateState, cancel: vi.fn(async () => undefined), completeBatch },
    createBatchId: () => 'batch-1',
    now: vi.fn(() => 1_000),
    wait: abortableWait,
    emit: (event) => events.push(event),
  })
  return {
    orchestrator,
    events,
    updateState,
    completeBatch,
    inspect,
    submit,
    collect,
    attachReferences,
    cleanupReferences,
    requestSuggestedName,
  }
}

describe('desktop generation orchestrator', () => {
  it('imports every generated image candidate, not just the last one', async () => {
    const test = harness([
      { kind: 'ready' },
      { kind: 'generating' },
      { kind: 'completed', images: [
        { src: 'blob:first', alt: 'Generated image 1' },
        { src: 'blob:second', alt: 'Generated image 2' },
      ], suggestedName: '云端机甲' },
    ])

    await test.orchestrator.start(REQUEST)

    expect(test.events.map((event) => event.state)).toEqual([
      'queued', 'opening_chatgpt', 'ready', 'sending', 'generating',
      'collecting', 'collecting', 'importing', 'completed',
    ])
    expect(test.collect).toHaveBeenCalledWith(
      [{ src: 'blob:first', order: 0 }, { src: 'blob:second', order: 1 }],
      expect.anything(),
      expect.any(AbortSignal),
    )
    expect(test.completeBatch).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1', batchId: 'batch-1', projectId: 'project-1',
      images: expect.arrayContaining([
        expect.objectContaining({ sourceUrl: 'blob:first' }),
        expect.objectContaining({ sourceUrl: 'blob:second' }),
      ]),
      suggestedNames: ['名1', '名2'],
    }))
    expect(test.requestSuggestedName).toHaveBeenCalledWith(
      expect.anything(),
      2,
      expect.any(AbortSignal),
    )
    expect(test.events.find((event) => event.state === 'collecting')?.message)
      .toBe('正在收集最后生成的图片。')
  })

  it('asks ChatGPT once for a single name when the image reply has no name', async () => {
    const test = harness([{ kind: 'ready' }, {
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    }])

    await test.orchestrator.start(REQUEST)

    expect(test.requestSuggestedName).toHaveBeenCalledOnce()
    expect(test.requestSuggestedName).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.any(AbortSignal),
    )
    expect(test.completeBatch).toHaveBeenCalledWith(expect.objectContaining({
      suggestedNames: ['名1'],
    }))
    expect(test.events.find((event) => event.message === '图片已生成，正在请 ChatGPT 命名。'))
      .toBeDefined()
  })

  it('imports the image when the follow-up naming request fails', async () => {
    const test = harness([{ kind: 'ready' }, {
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    }])
    test.requestSuggestedName.mockRejectedValueOnce(new Error('naming unavailable'))

    await test.orchestrator.start(REQUEST)

    expect(test.requestSuggestedName).toHaveBeenCalledOnce()
    expect(test.completeBatch).toHaveBeenCalledWith(expect.not.objectContaining({
      suggestedNames: expect.anything(),
    }))
    expect(test.events.at(-1)?.state).toBe('completed')
  })

  it('asks ChatGPT for distinct names when several images are generated', async () => {
    const test = harness([{ kind: 'ready' }, {
      kind: 'completed', images: [
        { src: 'blob:first', alt: 'Generated image 1' },
        { src: 'blob:second', alt: 'Generated image 2' },
      ],
    }])
    test.requestSuggestedName.mockImplementationOnce(async (_webContents, count) =>
      Array.from({ length: count }, (_, index) => `logo-${index + 1}`))

    await test.orchestrator.start(REQUEST)

    expect(test.requestSuggestedName).toHaveBeenCalledWith(expect.anything(), 2, expect.any(AbortSignal))
    expect(test.completeBatch).toHaveBeenCalledWith(expect.objectContaining({
      images: expect.arrayContaining([
        expect.objectContaining({ sourceUrl: 'blob:first' }),
        expect.objectContaining({ sourceUrl: 'blob:second' }),
      ]),
      suggestedNames: ['logo-1', 'logo-2'],
    }))
    expect(test.events.at(-1)?.state).toBe('completed')
  })

  it('pauses for login and resumes without creating a second task', async () => {
    const test = harness([{ kind: 'login_required', reason: 'login' }, { kind: 'ready' }, {
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    }])

    await test.orchestrator.start(REQUEST)

    expect(test.events.map((event) => event.state)).toContain('login_required')
    expect(test.submit).toHaveBeenCalledOnce()
  })

  it('waits for the ChatGPT composer to hydrate before declaring the page changed', async () => {
    const test = harness([
      { kind: 'page_changed', diagnostics: 'composer not rendered yet' },
      { kind: 'ready' },
      { kind: 'completed', images: [{ src: 'blob:first', alt: '' }] },
    ])

    await test.orchestrator.start(REQUEST)

    expect(test.inspect).toHaveBeenCalledTimes(3)
    expect(test.submit).toHaveBeenCalledOnce()
    expect(test.events.at(-1)?.state).toBe('completed')
  })

  it.each([
    [{ kind: 'refused', reason: 'no' }, 'refused'],
    [{ kind: 'rate_limited', reason: 'later' }, 'rate_limited'],
    [{ kind: 'page_changed', diagnostics: 'selector missing' }, 'page_changed'],
  ] as const)('emits a distinct terminal/recovery state for %s', async (pageState, expected) => {
    const test = harness([{ kind: 'ready' }, pageState])
    await test.orchestrator.start(REQUEST)
    expect(test.events.at(-1)?.state).toBe(expected)
  })

  it('rejects a simultaneous task', async () => {
    let release!: () => void
    const waiting = new Promise<void>((resolve) => { release = resolve })
    const test = harness([{ kind: 'ready' }, { kind: 'generating' }])
    test.orchestrator.setWaitForTesting(async () => waiting)

    const first = test.orchestrator.start(REQUEST)
    await Promise.resolve()
    await expect(test.orchestrator.start({ ...REQUEST, taskId: 'task-2' }))
      .rejects.toThrow('GENERATION_ALREADY_ACTIVE')
    await test.orchestrator.cancel('task-1')
    release()
    await first
    expect(test.events.at(-1)?.state).toBe('cancelled')
  })

  it('retries collection from the response boundary without resubmitting the prompt', async () => {
    const test = harness([{ kind: 'ready' }, { kind: 'page_changed', diagnostics: 'changed' }])
    await test.orchestrator.start(REQUEST)
    expect(test.submit).toHaveBeenCalledOnce()

    test.inspect.mockResolvedValueOnce({
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    })
    await test.orchestrator.retryCollection('task-1')

    expect(test.submit).toHaveBeenCalledOnce()
    expect(test.events.at(-1)?.state).toBe('completed')
  })

  it('turns backend import failure into a recoverable failure', async () => {
    const test = harness([{ kind: 'ready' }, {
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    }])
    test.completeBatch.mockRejectedValueOnce(new Error('backend unavailable'))

    await test.orchestrator.start(REQUEST)

    expect(test.events.at(-1)).toMatchObject({ state: 'failed', recoverable: true })
  })

  it('clears collected image bytes when the importing transition fails', async () => {
    const bytes = Uint8Array.of(7, 8, 9)
    const test = harness([{ kind: 'ready' }, {
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    }])
    test.collect.mockResolvedValueOnce([
      { order: 0, sourceUrl: 'blob:first', mimeType: 'image/png', sha256: 'a', bytes },
    ])
    test.updateState.mockImplementation(async (
      _taskId: string,
      state: DesktopGenerationEvent['state'],
      _message: string,
      _pageUrl: string,
    ) => {
      if (state === 'importing') throw new Error('importing transition failed')
    })

    await test.orchestrator.start(REQUEST)

    expect(bytes).toEqual(Uint8Array.of(0, 0, 0))
    expect(test.completeBatch).not.toHaveBeenCalled()
    expect(test.events.at(-1)).toMatchObject({ state: 'failed', recoverable: true })
  })

  it('attaches named references in order before submitting a mapped prompt', async () => {
    const test = harness([{ kind: 'ready' }, {
      kind: 'completed', images: [{ src: 'blob:first', alt: '' }],
    }])
    const prompt = '将@假面骑士build的身体和@喜羊羊的头部合成一个新的角色'
    await test.orchestrator.start({
      ...REQUEST,
      prompt,
      parentImageId: 'build',
      referenceImages: [
        { imageId: 'build', name: '假面骑士build' },
        { imageId: 'sheep', name: '喜羊羊' },
      ],
      transparentBackground: true,
    })

    expect(test.attachReferences).toHaveBeenCalledWith(expect.anything(), ['build', 'sheep'])
    expect(test.attachReferences.mock.invocationCallOrder[0]!).toBeLessThan(test.submit.mock.invocationCallOrder[0]!)
    expect(test.submit).toHaveBeenCalledWith(expect.anything(), buildSubmissionPrompt(prompt, [
      { imageId: 'build', name: '假面骑士build' },
      { imageId: 'sheep', name: '喜羊羊' },
    ], true))
    expect(test.cleanupReferences).toHaveBeenCalledOnce()
  })

  it('cleans up attached references when prompt submission fails', async () => {
    const test = harness([{ kind: 'ready' }])
    test.submit.mockRejectedValueOnce(new Error('submission failed'))

    await test.orchestrator.start({
      ...REQUEST,
      parentImageId: 'build',
      referenceImages: [{ imageId: 'build', name: '假面骑士build' }],
    })

    expect(test.events.at(-1)?.state).toBe('failed')
    expect(test.cleanupReferences).toHaveBeenCalledOnce()
  })
})

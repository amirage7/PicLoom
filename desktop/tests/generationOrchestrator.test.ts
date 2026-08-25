import { describe, expect, it, vi } from 'vitest'

import type { DesktopGenerationEvent, DesktopGenerationRequest } from '../src/contracts.js'
import type { PageState } from '../src/chatgpt/adapter.js'
import type { CollectedImage } from '../src/chatgpt/download.js'
import { GenerationOrchestrator } from '../src/generationOrchestrator.js'

const REQUEST: DesktopGenerationRequest = {
  taskId: 'task-1',
  projectId: 'project-1',
  prompt: '一朵花',
  parentImageId: null,
}

function harness(states: PageState[]) {
  const events: DesktopGenerationEvent[] = []
  const updateState = vi.fn(async () => undefined)
  const completeBatch = vi.fn(async () => ({ imageIds: ['image-1', 'image-2'] }))
  const inspect = vi.fn(async (): Promise<PageState> => states.shift() ?? { kind: 'generating' })
  const submit = vi.fn(async () => ({
    conversationUrlBefore: 'https://chatgpt.com/c/test',
    assistantResponseIdsBefore: ['old-response'],
    imageSourcesBefore: ['https://chatgpt.com/existing.webp'],
    submittedAt: 1,
  }))
  const collect = vi.fn(async (): Promise<CollectedImage[]> => [
    { order: 0, sourceUrl: 'blob:first', mimeType: 'image/png', sha256: 'a', bytes: Uint8Array.of(1) },
    { order: 1, sourceUrl: 'blob:second', mimeType: 'image/webp', sha256: 'b', bytes: Uint8Array.of(2) },
  ])
  const abortableWait = vi.fn(async (_ms: number, signal: AbortSignal) => {
    if (signal.aborted) throw signal.reason
  })
  const orchestrator = new GenerationOrchestrator({
    view: {
      loadHome: vi.fn(async () => undefined),
      getUrl: vi.fn(() => 'https://chatgpt.com/c/test'),
      getWebContents: vi.fn(() => ({ executeJavaScript: vi.fn(), getURL: () => 'https://chatgpt.com/c/test' })),
    },
    inspect,
    submit,
    collect,
    backend: { updateState, cancel: vi.fn(async () => undefined), completeBatch },
    createBatchId: () => 'batch-1',
    now: vi.fn(() => 1_000),
    wait: abortableWait,
    emit: (event) => events.push(event),
  })
  return { orchestrator, events, updateState, completeBatch, inspect, submit, collect }
}

describe('desktop generation orchestrator', () => {
  it('runs the full successful state path and imports every returned image', async () => {
    const test = harness([
      { kind: 'ready' },
      { kind: 'generating' },
      { kind: 'completed', images: [
        { src: 'blob:first', alt: 'Generated image 1' },
        { src: 'blob:second', alt: 'Generated image 2' },
      ] },
    ])

    await test.orchestrator.start(REQUEST)

    expect(test.events.map((event) => event.state)).toEqual([
      'queued', 'opening_chatgpt', 'ready', 'sending', 'generating',
      'collecting', 'importing', 'completed',
    ])
    expect(test.events.at(-1)?.imageIds).toEqual(['image-1', 'image-2'])
    expect(test.completeBatch).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'task-1', batchId: 'batch-1', projectId: 'project-1',
    }))
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
})

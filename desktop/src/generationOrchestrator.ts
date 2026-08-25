import { randomUUID } from 'node:crypto'

import type { PageState } from './chatgpt/adapter.js'
import type { CollectedImage, ImageSource } from './chatgpt/download.js'
import type { SubmissionReceipt } from './chatgpt/promptSubmission.js'
import type {
  DesktopGenerationEvent,
  DesktopGenerationRequest,
  DesktopGenerationState,
} from './contracts.js'

const GENERATION_TIMEOUT_MS = 8 * 60 * 1_000
const INITIAL_COMPOSER_ATTEMPTS = 20

interface AutomationWebContents {
  executeJavaScript(script: string): Promise<unknown>
  getURL(): string
}

interface OrchestratorView {
  loadHome(): Promise<void>
  getUrl(): string
  getWebContents(): AutomationWebContents
}

interface BatchCompletionInput {
  taskId: string
  projectId: string
  batchId: string
  sourceUrl: string
  images: CollectedImage[]
}

interface OrchestratorBackend {
  updateState(taskId: string, state: DesktopGenerationState, message: string, pageUrl: string): Promise<void>
  cancel(taskId: string): Promise<void>
  completeBatch(input: BatchCompletionInput): Promise<{ imageIds: string[] }>
}

interface GenerationOrchestratorOptions {
  view: OrchestratorView
  inspect(webContents: AutomationWebContents, assistantResponseIdsBefore: string[], imageSourcesBefore: string[]): Promise<PageState>
  submit(webContents: AutomationWebContents, prompt: string): Promise<SubmissionReceipt>
  collect(sources: ImageSource[], webContents: AutomationWebContents, signal: AbortSignal): Promise<CollectedImage[]>
  backend: OrchestratorBackend
  emit(event: DesktopGenerationEvent): void
  createBatchId?: () => string
  now?: () => number
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>
}

interface RecoverableTask {
  request: DesktopGenerationRequest
  receipt: SubmissionReceipt
  batchId: string
  state: DesktopGenerationState
}

interface ActiveTask extends RecoverableTask {
  controller: AbortController
}

const messages: Record<DesktopGenerationState, string> = {
  queued: '任务已创建',
  opening_chatgpt: '正在打开 ChatGPT',
  login_required: '请在右侧 ChatGPT 页面登录；登录完成后会自动继续。',
  ready: 'ChatGPT 已就绪',
  sending: '正在发送 Prompt',
  generating: 'ChatGPT 正在生成图片，可以隐藏页面继续等待。',
  collecting: '正在收集本次回复中的全部图片。',
  importing: '正在把图片保存到当前项目',
  completed: '图片已导入画布',
  refused: 'ChatGPT 未执行这次图片请求。',
  rate_limited: 'ChatGPT 当前额度或频率受限，请稍后在原对话中重试。',
  page_changed: 'ChatGPT 页面结构已变化，请打开页面检查后重试收集。',
  failed: '生成流程暂时失败',
  cancelled: '任务已取消',
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('cancelled')
}

export class GenerationOrchestrator {
  private active: ActiveTask | null = null
  private recoverable: RecoverableTask | null = null
  private lastEvent: DesktopGenerationEvent | null = null
  private waitFor: (milliseconds: number, signal: AbortSignal) => Promise<void>

  constructor(private readonly options: GenerationOrchestratorOptions) {
    this.waitFor = options.wait ?? defaultWait
  }

  setWaitForTesting(wait: (milliseconds: number, signal: AbortSignal) => Promise<void>): void {
    this.waitFor = wait
  }

  getLastEvent(): DesktopGenerationEvent | null {
    return this.lastEvent ? { ...this.lastEvent, imageIds: [...this.lastEvent.imageIds] } : null
  }

  private emit(
    taskId: string,
    state: DesktopGenerationState,
    options: { message?: string; imageIds?: string[]; recoverable?: boolean } = {},
  ): void {
    const event: DesktopGenerationEvent = {
      taskId,
      state,
      message: options.message ?? messages[state],
      imageIds: options.imageIds ?? [],
      recoverable: options.recoverable ?? false,
    }
    this.lastEvent = event
    this.options.emit(event)
  }

  private async transition(
    task: RecoverableTask,
    state: DesktopGenerationState,
    options: { message?: string; recoverable?: boolean } = {},
  ): Promise<void> {
    const controller = (task as Partial<ActiveTask>).controller
    if (controller) cancelled(controller.signal)
    const message = options.message ?? messages[state]
    await this.options.backend.updateState(
      task.request.taskId,
      state,
      message,
      this.options.view.getUrl(),
    )
    task.state = state
    this.emit(task.request.taskId, state, {
      message,
      ...(options.recoverable === undefined ? {} : { recoverable: options.recoverable }),
    })
  }

  async start(request: DesktopGenerationRequest): Promise<void> {
    if (this.active) throw new Error('GENERATION_ALREADY_ACTIVE')
    const task: ActiveTask = {
      request,
      receipt: {
        conversationUrlBefore: '',
        assistantResponseIdsBefore: [],
        imageSourcesBefore: [],
        submittedAt: 0,
      },
      batchId: this.options.createBatchId?.() ?? randomUUID(),
      state: 'queued',
      controller: new AbortController(),
    }
    this.active = task
    this.recoverable = task
    this.emit(request.taskId, 'queued')

    try {
      await this.transition(task, 'opening_chatgpt')
      await this.options.view.loadHome()
      const webContents = this.options.view.getWebContents()
      let initialState = await this.options.inspect(webContents, [], [])
      let composerAttempts = 0
      while (initialState.kind === 'login_required' || initialState.kind === 'page_changed') {
        if (initialState.kind === 'login_required') {
          if (task.state !== 'login_required') await this.transition(task, 'login_required')
          composerAttempts = 0
          await this.waitFor(750, task.controller.signal)
        } else {
          composerAttempts += 1
          if (composerAttempts >= INITIAL_COMPOSER_ATTEMPTS) break
          await this.waitFor(500, task.controller.signal)
        }
        cancelled(task.controller.signal)
        initialState = await this.options.inspect(webContents, [], [])
      }
      if (initialState.kind !== 'ready') {
        await this.finishPageState(task, initialState)
        return
      }

      await this.transition(task, 'ready')
      cancelled(task.controller.signal)
      await this.transition(task, 'sending')
      task.receipt = await this.options.submit(webContents, request.prompt)
      await this.transition(task, 'generating')
      await this.observeUntilComplete(task)
    } catch (error) {
      if (task.controller.signal.aborted) return
      await this.failRecoverably(task, error)
    } finally {
      if (this.active === task) this.active = null
    }
  }

  private async observeUntilComplete(task: ActiveTask): Promise<void> {
    const startedAt = this.options.now?.() ?? Date.now()
    while (true) {
      cancelled(task.controller.signal)
      const elapsed = (this.options.now?.() ?? Date.now()) - startedAt
      if (elapsed >= GENERATION_TIMEOUT_MS) {
        throw new Error('ChatGPT generation timed out')
      }
      const pageState = await this.options.inspect(
        this.options.view.getWebContents(),
        task.receipt.assistantResponseIdsBefore,
        task.receipt.imageSourcesBefore,
      )
      if (pageState.kind === 'generating' || pageState.kind === 'ready') {
        await this.waitFor(elapsed < 30_000 ? 750 : 2_000, task.controller.signal)
        continue
      }
      if (pageState.kind === 'completed') {
        await this.collectAndImport(task, pageState.images)
        return
      }
      await this.finishPageState(task, pageState)
      return
    }
  }

  private async finishPageState(task: RecoverableTask, pageState: PageState): Promise<void> {
    if (pageState.kind === 'refused') {
      await this.transition(task, 'refused', { message: pageState.reason })
    } else if (pageState.kind === 'rate_limited') {
      await this.transition(task, 'rate_limited', { message: pageState.reason, recoverable: true })
    } else if (pageState.kind === 'page_changed') {
      await this.transition(task, 'page_changed', { message: pageState.diagnostics, recoverable: true })
    } else if (pageState.kind === 'login_required') {
      await this.transition(task, 'page_changed', {
        message: 'ChatGPT 登录状态已失效，请重新登录后重试收集。',
        recoverable: true,
      })
    } else {
      await this.failRecoverably(task, new Error('ChatGPT response did not contain generated images'))
    }
  }

  private async collectAndImport(
    task: RecoverableTask,
    sources: Array<{ src: string; alt: string }>,
    signal = this.active?.controller.signal ?? new AbortController().signal,
  ): Promise<void> {
    await this.transition(task, 'collecting')
    const orderedSources = sources.map((image, order) => ({ src: image.src, order }))
    const images = await this.options.collect(orderedSources, this.options.view.getWebContents(), signal)
    if (images.length === 0) throw new Error('ChatGPT response contained no supported images')
    await this.transition(task, 'importing')
    try {
      const result = await this.options.backend.completeBatch({
        taskId: task.request.taskId,
        projectId: task.request.projectId,
        batchId: task.batchId,
        sourceUrl: this.options.view.getUrl(),
        images,
      })
      task.state = 'completed'
      this.emit(task.request.taskId, 'completed', { imageIds: result.imageIds })
      this.recoverable = null
    } finally {
      for (const image of images) image.bytes.fill(0)
    }
  }

  private async failRecoverably(task: RecoverableTask, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : messages.failed
    try {
      await this.transition(task, 'failed', { message, recoverable: true })
    } catch {
      task.state = 'failed'
      this.emit(task.request.taskId, 'failed', { message, recoverable: true })
    }
  }

  async cancel(taskId: string): Promise<void> {
    if (!this.active || this.active.request.taskId !== taskId) throw new Error('UNKNOWN_TASK_ID')
    const task = this.active
    task.controller.abort(new Error('cancelled'))
    await this.options.backend.cancel(taskId)
    task.state = 'cancelled'
    this.emit(taskId, 'cancelled')
    this.active = null
    this.recoverable = null
  }

  async retryCollection(taskId: string): Promise<void> {
    if (this.active) throw new Error('GENERATION_ALREADY_ACTIVE')
    if (!this.recoverable || this.recoverable.request.taskId !== taskId) {
      throw new Error('UNKNOWN_TASK_ID')
    }
    const task = this.recoverable
    const controller = new AbortController()
    this.active = { ...task, controller }
    try {
      const state = await this.options.inspect(
        this.options.view.getWebContents(),
        task.receipt.assistantResponseIdsBefore,
        task.receipt.imageSourcesBefore,
      )
      if (state.kind !== 'completed') {
        await this.finishPageState(task, state)
        return
      }
      await this.collectAndImport(task, state.images, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) await this.failRecoverably(task, error)
    } finally {
      this.active = null
    }
  }

  async shutdown(): Promise<void> {
    if (!this.active) return
    const taskId = this.active.request.taskId
    this.active.controller.abort(new Error('shutdown'))
    this.emit(taskId, 'cancelled', { message: '应用已关闭' })
    this.active = null
  }
}

import type { BridgeErrorCode } from './shared/protocol'


interface TaskInput {
  id: string
  prompt: string
}


interface PageAdapter {
  getState(): string
  submitPrompt(prompt: string): void
}


export class TaskExecutionError extends Error {
  constructor(readonly code: BridgeErrorCode, message: string) {
    super(message)
  }
}


interface TabMessageApi {
  sendMessage(tabId: number, message: unknown): Promise<unknown>
  reload(tabId: number): Promise<unknown>
}


export async function sendTaskMessage<T>(
  tabs: TabMessageApi,
  tabId: number,
  message: unknown,
  waitForReload: () => Promise<void>,
): Promise<T> {
  try {
    return await tabs.sendMessage(tabId, message) as T
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Receiving end does not exist')) throw error
    await tabs.reload(tabId)
    await waitForReload()
    return await tabs.sendMessage(tabId, message) as T
  }
}

export async function executeTask(
  task: TaskInput,
  adapter: PageAdapter,
  waitForImage: () => Promise<Blob>,
): Promise<Blob> {
  const state = adapter.getState()
  if (state === 'login-required') throw new TaskExecutionError('LOGIN_REQUIRED', '请在官方 ChatGPT 页面登录')
  if (state !== 'ready') throw new TaskExecutionError('PAGE_UNSUPPORTED', 'ChatGPT 页面暂不可用')
  try {
    adapter.submitPrompt(task.prompt)
  } catch {
    throw new TaskExecutionError('PROMPT_SUBMIT_FAILED', 'Prompt 提交失败')
  }
  return waitForImage()
}

import type {
  ChatGptViewBounds,
  DesktopGenerationRequest,
} from './contracts.js'

export const IPC_CHANNELS = {
  runtimeStatus: 'desktop:get-runtime-status',
  setChatGptView: 'desktop:set-chatgpt-view',
  startGeneration: 'desktop:start-generation',
  cancelGeneration: 'desktop:cancel-generation',
  retryCollection: 'desktop:retry-collection',
} as const

interface IpcMainLike {
  handle(channel: string, handler: (event: unknown, input?: unknown) => unknown): void
}

interface ViewControllerLike {
  show(bounds: ChatGptViewBounds): void
  hide(): void
  isVisible(): boolean
}

interface RegisterDesktopIpcOptions {
  ipcMain: IpcMainLike
  view: ViewControllerLike
  backendOnline(): boolean
}

function nonEmptyString(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || [...trimmed].length > maximum) return null
  return trimmed
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

export function validateTaskId(value: unknown): string {
  const taskId = nonEmptyString(value, 10_000)
  if (!taskId) throw new Error('INVALID_TASK_ID')
  return taskId
}

export function validateViewCommand(value: unknown): {
  visible: boolean
  bounds?: ChatGptViewBounds
} {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_VIEW_COMMAND')
  const input = value as { visible?: unknown; bounds?: unknown }
  if (typeof input.visible !== 'boolean') throw new Error('INVALID_VIEW_COMMAND')
  if (input.bounds === undefined) {
    if (input.visible) throw new Error('INVALID_VIEW_COMMAND')
    return { visible: false }
  }
  if (typeof input.bounds !== 'object' || input.bounds === null) throw new Error('INVALID_VIEW_COMMAND')
  const bounds = input.bounds as Record<keyof ChatGptViewBounds, unknown>
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(validCoordinate)) {
    throw new Error('INVALID_VIEW_COMMAND')
  }
  return {
    visible: input.visible,
    bounds: {
      x: bounds.x as number,
      y: bounds.y as number,
      width: bounds.width as number,
      height: bounds.height as number,
    },
  }
}

export function validateGenerationRequest(value: unknown): DesktopGenerationRequest {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_GENERATION_REQUEST')
  const input = value as Record<string, unknown>
  const taskId = nonEmptyString(input.taskId, 10_000)
  const projectId = nonEmptyString(input.projectId, 10_000)
  const prompt = nonEmptyString(input.prompt, 20_000)
  const parentImageId = input.parentImageId === null
    ? null
    : nonEmptyString(input.parentImageId, 10_000)
  if (!taskId || !projectId || !prompt || parentImageId === null && input.parentImageId !== null) {
    throw new Error('INVALID_GENERATION_REQUEST')
  }
  return { taskId, projectId, prompt, parentImageId }
}

export function registerDesktopIpc(options: RegisterDesktopIpcOptions): void {
  options.ipcMain.handle(IPC_CHANNELS.runtimeStatus, async () => ({
    backendOnline: options.backendOnline(),
    chatgptVisible: options.view.isVisible(),
  }))
  options.ipcMain.handle(IPC_CHANNELS.setChatGptView, async (_event, value) => {
    const command = validateViewCommand(value)
    if (command.visible && command.bounds) options.view.show(command.bounds)
    else options.view.hide()
  })
  options.ipcMain.handle(IPC_CHANNELS.startGeneration, async (_event, value) => {
    validateGenerationRequest(value)
    throw new Error('DESKTOP_GENERATION_NOT_READY')
  })
  options.ipcMain.handle(IPC_CHANNELS.cancelGeneration, async (_event, value) => {
    validateTaskId(value)
    throw new Error('DESKTOP_GENERATION_NOT_READY')
  })
  options.ipcMain.handle(IPC_CHANNELS.retryCollection, async (_event, value) => {
    validateTaskId(value)
    throw new Error('DESKTOP_GENERATION_NOT_READY')
  })
}

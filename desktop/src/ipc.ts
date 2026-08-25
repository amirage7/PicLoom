import type {
  ChatGptViewBounds,
  DesktopGenerationRequest,
} from './contracts.js'

export const IPC_CHANNELS = {
  runtimeStatus: 'desktop:get-runtime-status',
  lastGenerationEvent: 'desktop:get-last-generation-event',
  setChatGptView: 'desktop:set-chatgpt-view',
  reloadChatGpt: 'desktop:reload-chatgpt',
  startGeneration: 'desktop:start-generation',
  cancelGeneration: 'desktop:cancel-generation',
  retryCollection: 'desktop:retry-collection',
  saveImage: 'desktop:save-image',
} as const

interface IpcMainLike {
  handle(channel: string, handler: (event: unknown, input?: unknown) => unknown): void
}

interface ViewControllerLike {
  show(bounds: ChatGptViewBounds): void
  reload(): void
  hide(): void
  isVisible(): boolean
}
interface OrchestratorLike {
  start(request: DesktopGenerationRequest): Promise<void>
  cancel(taskId: string): Promise<void>
  retryCollection(taskId: string): Promise<void>
  getLastEvent(): unknown
}

interface ImageSaverLike {
  save(input: { imageId: string; fileName: string }): Promise<{ saved: boolean; filePath?: string }>
}

interface RegisterDesktopIpcOptions {
  ipcMain: IpcMainLike
  view: ViewControllerLike
  backendOnline(): boolean
  orchestrator: OrchestratorLike
  imageSaver?: ImageSaverLike
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

function validatedReferences(value: unknown): DesktopGenerationRequest['referenceImages'] | null {
  if (!Array.isArray(value) || value.length > 12) return null
  const references: DesktopGenerationRequest['referenceImages'] = []
  const imageIds = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null
    const input = item as Record<string, unknown>
    const imageId = nonEmptyString(input.imageId, 10_000)
    const name = nonEmptyString(input.name, 80)
    if (!imageId || !name || imageIds.has(imageId)) return null
    imageIds.add(imageId)
    references.push({ imageId, name })
  }
  return references
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
  const referenceImages = validatedReferences(input.referenceImages)
  const expectedParentId = referenceImages?.[0]?.imageId ?? null
  if (
    !taskId || !projectId || !prompt || referenceImages === null ||
    (parentImageId === null && input.parentImageId !== null) ||
    parentImageId !== expectedParentId
  ) {
    throw new Error('INVALID_GENERATION_REQUEST')
  }
  return { taskId, projectId, prompt, parentImageId, referenceImages }
}

export function validateSaveImageRequest(value: unknown): { imageId: string; fileName: string } {
  if (typeof value !== 'object' || value === null) throw new Error('INVALID_SAVE_IMAGE_REQUEST')
  const input = value as Record<string, unknown>
  const imageId = nonEmptyString(input.imageId, 10_000)
  const fileName = nonEmptyString(input.fileName, 255)
  if (!imageId || !fileName) throw new Error('INVALID_SAVE_IMAGE_REQUEST')
  return { imageId, fileName }
}

export function registerDesktopIpc(options: RegisterDesktopIpcOptions): void {
  options.ipcMain.handle(IPC_CHANNELS.runtimeStatus, async () => ({
    backendOnline: options.backendOnline(),
    chatgptVisible: options.view.isVisible(),
  }))
  options.ipcMain.handle(IPC_CHANNELS.lastGenerationEvent, async () => options.orchestrator.getLastEvent())
  options.ipcMain.handle(IPC_CHANNELS.setChatGptView, async (_event, value) => {
    const command = validateViewCommand(value)
    if (command.visible && command.bounds) options.view.show(command.bounds)
    else options.view.hide()
  })
  options.ipcMain.handle(IPC_CHANNELS.reloadChatGpt, async () => {
    options.view.reload()
  })
  options.ipcMain.handle(IPC_CHANNELS.startGeneration, async (_event, value) => {
    await options.orchestrator.start(validateGenerationRequest(value))
  })
  options.ipcMain.handle(IPC_CHANNELS.cancelGeneration, async (_event, value) => {
    await options.orchestrator.cancel(validateTaskId(value))
  })
  options.ipcMain.handle(IPC_CHANNELS.retryCollection, async (_event, value) => {
    await options.orchestrator.retryCollection(validateTaskId(value))
  })
  options.ipcMain.handle(IPC_CHANNELS.saveImage, async (_event, value) => {
    if (!options.imageSaver) throw new Error('SAVE_IMAGE_UNAVAILABLE')
    return options.imageSaver.save(validateSaveImageRequest(value))
  })
}

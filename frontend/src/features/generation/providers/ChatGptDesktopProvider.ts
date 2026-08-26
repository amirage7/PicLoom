import type { DesktopBridgeApi, DesktopGenerationEvent } from '../../desktop/types'
import * as api from '../generationApi'
import type {
  GenerateImageInput,
  ImageGenerationTask,
  ImageProvider,
  ProviderAvailability,
} from '../types'

function parseImageIds(value: api.TaskDto): string[] {
  if (value.image_ids_json) {
    try {
      const parsed = JSON.parse(value.image_ids_json) as unknown
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')) return parsed
    } catch {
      // Preserve compatibility with pre-migration rows.
    }
  }
  return value.image_id ? [value.image_id] : []
}

function recoverableStatus(status: api.TaskDto['status']): boolean {
  return status === 'page_changed' || status === 'rate_limited' || status === 'failed'
}

export function desktopTask(value: api.TaskDto): ImageGenerationTask {
  const imageIds = parseImageIds(value)
  return {
    id: value.id,
    projectId: value.project_id ?? '',
    prompt: value.prompt,
    status: value.status,
    progressMessage: value.progress_message,
    chatUrl: value.chat_url,
    imageId: value.image_id ?? imageIds[0] ?? null,
    imageIds,
    errorCode: value.error_code,
    recoverable: recoverableStatus(value.status),
  }
}

export class ChatGptDesktopProvider implements ImageProvider {
  readonly id = 'chatgpt-desktop'
  readonly capabilities = {
    embeddedLogin: true,
    multipleImages: true,
    resumableCollection: true,
  } as const

  constructor(private readonly bridge: DesktopBridgeApi) {}

  async getAvailability(): Promise<ProviderAvailability> {
    const status = await this.bridge.getRuntimeStatus()
    return {
      paired: true,
      online: status.backendOnline,
      state: status.chatgptVisible ? 'visible' : 'ready',
      chatUrl: null,
      extensionVersion: null,
    }
  }

  async generate(input: GenerateImageInput): Promise<ImageGenerationTask> {
    const referenceImages = input.referenceImages ?? (input.parentImageId
      ? [{ imageId: input.parentImageId, name: '参考图片' }]
      : [])
    const parentImageId = referenceImages[0]?.imageId ?? input.parentImageId
    const task = await api.createGenerationTask(input.projectId, input.prompt, parentImageId)
    await this.bridge.startGeneration({
      taskId: task.id,
      projectId: task.project_id,
      prompt: task.prompt,
      parentImageId: task.parent_image_id,
      referenceImages,
      transparentBackground: input.transparentBackground ?? false,
    })
    return desktopTask(await api.getGenerationTask(task.id))
  }

  async getTask(taskId: string): Promise<ImageGenerationTask> {
    return desktopTask(await api.getGenerationTask(taskId))
  }

  async cancel(taskId: string): Promise<void> {
    await this.bridge.cancelGeneration(taskId)
  }

  async retryCollection(taskId: string): Promise<void> {
    await this.bridge.retryCollection(taskId)
  }

  subscribe(listener: (event: DesktopGenerationEvent) => void): () => void {
    return this.bridge.onGenerationEvent(listener)
  }
}

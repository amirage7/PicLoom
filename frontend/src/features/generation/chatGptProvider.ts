import * as api from './generationApi'
import type { GenerateImageInput, ImageGenerationTask, ImageProvider, ProviderAvailability } from './types'

const toTask = (value: api.TaskDto): ImageGenerationTask => ({ id: value.id, projectId: value.project_id, prompt: value.prompt, status: value.status, progressMessage: value.progress_message, chatUrl: value.chat_url, imageId: value.image_id, errorCode: value.error_code })

export class ChatGptImageProvider implements ImageProvider {
  readonly id = 'chatgpt-web'
  async getAvailability(): Promise<ProviderAvailability> {
    const value = await api.getProviderStatus()
    return { paired: value.paired, online: value.online, state: value.state, chatUrl: value.chat_url, extensionVersion: value.extension_version }
  }
  async generate(input: GenerateImageInput) { return toTask(await api.createGenerationTask(input.projectId, input.prompt, input.parentImageId)) }
  async getTask(taskId: string) { return toTask(await api.getGenerationTask(taskId)) }
  async cancel(taskId: string) { await api.cancelGenerationTask(taskId) }
}

export const chatGptImageProvider = new ChatGptImageProvider()

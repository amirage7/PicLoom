export type GenerationStatus = 'queued' | 'connecting' | 'sending' | 'generating' | 'downloading' | 'completed' | 'failed' | 'cancelled'

export interface ProviderAvailability { paired: boolean; online: boolean; state: string; chatUrl: string | null; extensionVersion: string | null }
export interface GenerateImageInput { projectId: string; prompt: string; parentImageId?: string }
export interface ImageGenerationTask { id: string; projectId: string; prompt: string; status: GenerationStatus; progressMessage: string; chatUrl: string | null; imageId: string | null; errorCode: string | null }

export interface ImageProvider {
  readonly id: string
  getAvailability(): Promise<ProviderAvailability>
  generate(input: GenerateImageInput): Promise<ImageGenerationTask>
  getTask(taskId: string): Promise<ImageGenerationTask>
  cancel(taskId: string): Promise<void>
}

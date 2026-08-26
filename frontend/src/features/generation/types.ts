export type GenerationStatus =
  | 'queued' | 'connecting' | 'opening_chatgpt' | 'login_required' | 'ready'
  | 'sending' | 'generating' | 'downloading' | 'collecting' | 'importing'
  | 'completed' | 'refused' | 'rate_limited' | 'page_changed'
  | 'failed' | 'cancelled'

export interface ProviderCapabilities {
  embeddedLogin: boolean
  multipleImages: boolean
  resumableCollection: boolean
}

export interface ProviderAvailability { paired: boolean; online: boolean; state: string; chatUrl: string | null; extensionVersion: string | null }
export interface GenerateImageReference { imageId: string; name: string }
export interface GenerateImageInput { projectId: string; prompt: string; parentImageId?: string; referenceImages?: GenerateImageReference[]; transparentBackground?: boolean }
export interface ImageGenerationTask { id: string; projectId: string; prompt: string; status: GenerationStatus; progressMessage: string; chatUrl: string | null; imageId: string | null; imageIds: string[]; errorCode: string | null; recoverable: boolean }

export interface ImageProvider {
  readonly id: string
  readonly capabilities?: ProviderCapabilities
  getAvailability(): Promise<ProviderAvailability>
  generate(input: GenerateImageInput): Promise<ImageGenerationTask>
  getTask(taskId: string): Promise<ImageGenerationTask>
  cancel(taskId: string): Promise<void>
  retryCollection?(taskId: string): Promise<void>
}

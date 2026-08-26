export type DesktopGenerationState =
  | 'queued' | 'opening_chatgpt' | 'login_required' | 'ready'
  | 'sending' | 'generating' | 'collecting' | 'importing'
  | 'completed' | 'refused' | 'rate_limited' | 'page_changed'
  | 'failed' | 'cancelled'

export interface DesktopReferenceImage {
  imageId: string
  name: string
}

export interface DesktopGenerationRequest {
  taskId: string
  projectId: string | null
  prompt: string
  parentImageId: string | null
  referenceImages: DesktopReferenceImage[]
  transparentBackground: boolean
}

export interface DesktopGenerationEvent {
  taskId: string
  state: DesktopGenerationState
  message: string
  imageIds: string[]
  recoverable: boolean
}

export interface ChatGptViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DesktopBridgeApi {
  getRuntimeStatus(): Promise<{ backendOnline: boolean; chatgptVisible: boolean }>
  setChatGptView(input: { visible: boolean; bounds?: ChatGptViewBounds }): Promise<void>
  reloadChatGpt(): Promise<void>
  startGeneration(request: DesktopGenerationRequest): Promise<void>
  cancelGeneration(taskId: string): Promise<void>
  retryCollection(taskId: string): Promise<void>
  saveImage?(input: { imageId: string; fileName: string }): Promise<{ saved: boolean; filePath?: string }>
  onGenerationEvent(listener: (event: DesktopGenerationEvent) => void): () => void
}

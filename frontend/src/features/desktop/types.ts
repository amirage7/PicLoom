export type DesktopGenerationState =
  | 'queued' | 'opening_chatgpt' | 'login_required' | 'ready'
  | 'sending' | 'generating' | 'collecting' | 'importing'
  | 'completed' | 'refused' | 'rate_limited' | 'page_changed'
  | 'failed' | 'cancelled'

export interface DesktopGenerationRequest {
  taskId: string
  projectId: string
  prompt: string
  parentImageId: string | null
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
  onGenerationEvent(listener: (event: DesktopGenerationEvent) => void): () => void
}

export type GenerationStatus = 'queued' | 'connecting' | 'sending' | 'generating' | 'downloading' | 'completed' | 'failed' | 'cancelled'

export interface GenerationTask {
  id: string
  project_id: string
  prompt: string
  status: GenerationStatus
  progress_message: string
  chat_url: string | null
  image_id: string | null
  error_code: string | null
}

export type BridgeErrorCode = 'EXTENSION_OFFLINE' | 'LOGIN_REQUIRED' | 'CHAT_MODE_UNAVAILABLE' | 'PAGE_UNSUPPORTED' | 'PROMPT_SUBMIT_FAILED' | 'GENERATION_REJECTED' | 'GENERATION_TIMEOUT' | 'IMAGE_NOT_FOUND' | 'IMAGE_DOWNLOAD_FAILED'

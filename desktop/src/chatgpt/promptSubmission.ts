export interface SubmissionReceipt {
  conversationUrlBefore: string
  assistantResponseIdsBefore: string[]
  submittedAt: number
}

export type PromptSubmissionErrorCode =
  | 'invalid_prompt'
  | 'login_required'
  | 'page_changed'
  | 'submission_failed'

export class PromptSubmissionError extends Error {
  constructor(
    readonly code: PromptSubmissionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'PromptSubmissionError'
  }
}

interface SubmissionWebContents {
  executeJavaScript(script: string): Promise<unknown>
  getURL(): string
}

type RuntimeSubmissionResult =
  | { kind: 'submitted'; assistantResponseIdsBefore: string[] }
  | { kind: 'login_required' }
  | { kind: 'composer_missing' }
  | { kind: 'send_unavailable' }


function runtimeSubmitPrompt(prompt: string): RuntimeSubmissionResult {
  const login = document.querySelector(
    '[data-testid="login-button"], a[href*="/auth/login"], button[data-testid*="login"]',
  )
  if (login) return { kind: 'login_required' }

  const composer = document.querySelector<HTMLElement>(
    '#prompt-textarea, textarea[data-testid*="composer"], [contenteditable="true"][data-testid*="composer"]',
  )
  if (!composer) return { kind: 'composer_missing' }

  const assistantResponseIdsBefore = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-message-author-role="assistant"]',
  )).map((response, index) => response.dataset.messageId || response.id || `assistant-index-${index}`)

  composer.focus()
  if (composer instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(composer, prompt)
  } else if (composer instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(composer, prompt)
  } else {
    composer.textContent = prompt
  }
  composer.dispatchEvent(new Event('input', { bubbles: true }))
  composer.dispatchEvent(new Event('change', { bubbles: true }))

  const sendButton = Array.from(document.querySelectorAll<HTMLButtonElement>(
    'button[data-testid="send-button"], button[aria-label*="Send"], button[data-testid*="send"]',
  )).find((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true')
  if (sendButton) {
    sendButton.click()
    return { kind: 'submitted', assistantResponseIdsBefore }
  }

  const enterCanSubmit = (
    composer.getAttribute('contenteditable') === 'true'
    && composer.getAttribute('data-enter-behavior') !== 'newline'
  )
  if (enterCanSubmit) {
    composer.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    }))
    return { kind: 'submitted', assistantResponseIdsBefore }
  }
  return { kind: 'send_unavailable' }
}

export function createPromptSubmissionScript(prompt: string): string {
  return `(${runtimeSubmitPrompt.toString()})(${JSON.stringify(prompt)})`
}

function isRuntimeResult(value: unknown): value is RuntimeSubmissionResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<RuntimeSubmissionResult>
  if (result.kind === 'submitted') {
    return (
      Array.isArray(result.assistantResponseIdsBefore)
      && result.assistantResponseIdsBefore.every((id) => typeof id === 'string')
    )
  }
  return ['login_required', 'composer_missing', 'send_unavailable'].includes(result.kind ?? '')
}

export async function submitPrompt(
  webContents: SubmissionWebContents,
  prompt: string,
): Promise<SubmissionReceipt> {
  const normalizedPrompt = prompt.trim()
  if (!normalizedPrompt || [...normalizedPrompt].length > 20_000) {
    throw new PromptSubmissionError('invalid_prompt', 'Prompt must contain 1 to 20,000 characters')
  }

  const conversationUrlBefore = webContents.getURL()
  const result = await webContents.executeJavaScript(createPromptSubmissionScript(normalizedPrompt))
  if (!isRuntimeResult(result)) {
    throw new PromptSubmissionError('submission_failed', 'ChatGPT returned an invalid submission result')
  }
  if (result.kind === 'login_required') {
    throw new PromptSubmissionError('login_required', 'ChatGPT login is required')
  }
  if (result.kind === 'composer_missing') {
    throw new PromptSubmissionError('page_changed', 'ChatGPT composer was not found')
  }
  if (result.kind === 'send_unavailable') {
    throw new PromptSubmissionError('submission_failed', 'ChatGPT send control is unavailable')
  }

  return {
    conversationUrlBefore,
    assistantResponseIdsBefore: result.assistantResponseIdsBefore,
    submittedAt: Date.now(),
  }
}

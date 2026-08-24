export type ChatPageState = 'login-required' | 'ready' | 'generating' | 'rejected' | 'unsupported'


export class PageAdapterError extends Error {
  constructor(readonly code: 'PAGE_UNSUPPORTED' | 'PROMPT_SUBMIT_FAILED') {
    super(code === 'PAGE_UNSUPPORTED' ? 'ChatGPT 页面结构暂不兼容' : 'Prompt 提交失败')
  }
}


export class ChatPageAdapter {
  constructor(private readonly root: Document) {}

  getState(): ChatPageState {
    if (this.root.querySelector('form[action*="login"], [data-testid="login-button"]')) return 'login-required'
    if (this.root.querySelector('[data-testid="stop-button"], button[aria-label*="Stop" i]')) return 'generating'
    if (this.root.querySelector('[data-message-author-role="assistant"] [data-block-type="refusal"]')) return 'rejected'
    if (this.getComposer() && this.getSubmitButton()) return 'ready'
    return 'unsupported'
  }

  submitPrompt(prompt: string): void {
    const composer = this.getComposer()
    const submit = this.getSubmitButton()
    if (!composer || !submit) throw new PageAdapterError('PAGE_UNSUPPORTED')
    try {
      composer.focus()
      composer.textContent = prompt
      composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }))
      submit.click()
    } catch {
      throw new PageAdapterError('PROMPT_SUBMIT_FAILED')
    }
  }

  findCompletedImage(): HTMLImageElement | null {
    return this.root.querySelector<HTMLImageElement>(
      '[data-message-author-role="assistant"][data-generation-complete="true"] img[data-testid="generated-image"], [data-message-author-role="assistant"][data-generation-complete="true"] img',
    )
  }

  private getComposer(): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(
      '[data-testid="prompt-textarea"], #prompt-textarea, [contenteditable="true"][role="textbox"]',
    )
  }

  private getSubmitButton(): HTMLButtonElement | null {
    return this.root.querySelector<HTMLButtonElement>(
      '[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="发送"]',
    )
  }
}

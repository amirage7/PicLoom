import type { ChatGptViewBounds } from './contracts.js'

interface ViewWebContents {
  loadURL(url: string): Promise<void>
  close(): void
}

interface ViewLike {
  webContents: ViewWebContents
  setBounds(bounds: ChatGptViewBounds): void
}

interface ParentContentView {
  addChildView(view: ViewLike): void
  removeChildView(view: ViewLike): void
}

interface ChatGptViewControllerOptions {
  parent: ParentContentView
  createView(options: {
    webPreferences: {
      partition: string
      nodeIntegration: boolean
      contextIsolation: boolean
      sandbox: boolean
      webSecurity: boolean
    }
  }): ViewLike
}

export interface ChatGptViewControllerApi {
  show(bounds: ChatGptViewBounds): void
  hide(): void
  setBounds(bounds: ChatGptViewBounds): void
  isVisible(): boolean
  loadHome(): Promise<void>
  destroy(): void
}

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value))
}

export class ChatGptViewController implements ChatGptViewControllerApi {
  private readonly view: ViewLike
  private visible = false
  private destroyed = false

  constructor(private readonly options: ChatGptViewControllerOptions) {
    this.view = options.createView({
      webPreferences: {
        partition: 'persist:ai-image-canvas-chatgpt',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
  }

  show(bounds: ChatGptViewBounds): void {
    if (this.destroyed) return
    if (!this.visible) {
      this.options.parent.addChildView(this.view)
      this.visible = true
    }
    this.setBounds(bounds)
  }

  hide(): void {
    if (!this.visible || this.destroyed) return
    this.options.parent.removeChildView(this.view)
    this.visible = false
  }

  setBounds(bounds: ChatGptViewBounds): void {
    if (this.destroyed) return
    this.view.setBounds({
      x: clampDimension(bounds.x),
      y: clampDimension(bounds.y),
      width: clampDimension(bounds.width),
      height: clampDimension(bounds.height),
    })
  }

  isVisible(): boolean {
    return this.visible
  }

  loadHome(): Promise<void> {
    if (this.destroyed) return Promise.reject(new Error('ChatGPT view has been destroyed'))
    return this.view.webContents.loadURL('https://chatgpt.com/')
  }

  destroy(): void {
    if (this.destroyed) return
    this.hide()
    this.view.webContents.close()
    this.destroyed = true
  }
}

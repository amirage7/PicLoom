interface DebuggerLike {
  isAttached(): boolean
  attach(version?: string): void
  detach(): void
  sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>
  on?(event: 'message', listener: DebuggerMessageListener): void
  removeListener?(event: 'message', listener: DebuggerMessageListener): void
}

type DebuggerMessageListener = (
  event: unknown,
  method: string,
  params: Record<string, unknown>,
) => void

interface AttachmentWebContents {
  executeJavaScript(script: string): Promise<unknown>
  debugger: DebuggerLike
}

async function locateFileInput(debuggerApi: DebuggerLike): Promise<number> {
  const documentResult = await debuggerApi.sendCommand('DOM.getDocument') as { root?: { nodeId?: number } }
  const rootId = documentResult.root?.nodeId
  if (!rootId) throw new Error('CHATGPT_DOCUMENT_UNAVAILABLE')
  const query = await debuggerApi.sendCommand('DOM.querySelector', {
    nodeId: rootId,
    selector: 'input[type="file"]',
  }) as { nodeId?: number }
  return query.nodeId ?? 0
}

function isChatGptFileUploadRequest(params: Record<string, unknown>): boolean {
  const request = params.request as { method?: unknown; url?: unknown } | undefined
  return request?.method === 'POST'
    && typeof request.url === 'string'
    && /\/(?:files?|uploads?|attachments?)(?:[/?]|$)/i.test(request.url)
}

function startUploadObservation(debuggerApi: DebuggerLike): Promise<void> | undefined {
  if (!debuggerApi.on || !debuggerApi.removeListener) return undefined

  const uploadRequestIds = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let listener: DebuggerMessageListener
  const completed = new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      if (timer) clearTimeout(timer)
      debuggerApi.removeListener?.('message', listener)
      if (error) reject(error)
      else resolve()
    }
    listener = (_event, method, params) => {
      if (method === 'Network.requestWillBeSent' && isChatGptFileUploadRequest(params)) {
        const requestId = params.requestId
        if (typeof requestId === 'string') uploadRequestIds.add(requestId)
        return
      }
      if (method === 'Network.responseReceived' && uploadRequestIds.has(String(params.requestId))) {
        const status = (params.response as { status?: unknown } | undefined)?.status
        if (typeof status === 'number' && status >= 200 && status < 300) finish()
        else finish(new Error('CHATGPT_REFERENCE_UPLOAD_REJECTED'))
      }
    }
    timer = setTimeout(() => finish(new Error('CHATGPT_REFERENCE_UPLOAD_NOT_CONFIRMED')), 12_000)
  })
  debuggerApi.on('message', listener!)
  return completed
}

async function dispatchFileSelection(
  debuggerApi: DebuggerLike,
  nodeId: number,
  expectedFileCount: number,
): Promise<void> {
  const resolved = await debuggerApi.sendCommand('DOM.resolveNode', { nodeId }) as {
    object?: { objectId?: string }
  }
  const objectId = resolved.object?.objectId
  if (!objectId) throw new Error('CHATGPT_FILE_INPUT_UNAVAILABLE')
  const dispatched = await debuggerApi.sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() {
      this.dispatchEvent(new Event('input', { bubbles: true }))
      this.dispatchEvent(new Event('change', { bubbles: true }))
      return this.files ? this.files.length : 0
    }`,
    returnByValue: true,
  }) as { result?: { value?: unknown } }
  if (dispatched.result?.value !== expectedFileCount) {
    throw new Error('CHATGPT_FILE_SELECTION_NOT_APPLIED')
  }
}

export async function attachReferenceFiles(
  webContents: AttachmentWebContents,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) throw new Error('CHATGPT_REFERENCE_FILES_EMPTY')
  const attachedHere = !webContents.debugger.isAttached()
  if (attachedHere) webContents.debugger.attach('1.3')
  try {
    let nodeId = await locateFileInput(webContents.debugger)
    if (!nodeId) {
      await webContents.executeJavaScript(`(async () => {
        const matchesFileAction = (item) => {
          const label = (item.getAttribute('aria-label') || item.textContent || '').toLowerCase()
          return ['attach', 'upload', 'add', 'file', 'photo', '添加', '上传', '文件', '照片']
            .some((term) => label.includes(term))
        }
        const trigger = Array.from(document.querySelectorAll('button')).find(matchesFileAction)
        trigger?.click()
        await new Promise((resolve) => setTimeout(resolve, 120))
        const menuitem = Array.from(document.querySelectorAll('[role="menuitem"], button'))
          .find((item) => item !== trigger && matchesFileAction(item))
        menuitem?.click()
        return Boolean(trigger || menuitem)
      })()`)
      await new Promise((resolve) => setTimeout(resolve, 250))
      nodeId = await locateFileInput(webContents.debugger)
    }
    if (!nodeId) throw new Error('CHATGPT_FILE_INPUT_NOT_FOUND')
    const uploadCompleted = startUploadObservation(webContents.debugger)
    if (uploadCompleted) await webContents.debugger.sendCommand('Network.enable')
    await webContents.debugger.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files: filePaths,
    })
    await dispatchFileSelection(webContents.debugger, nodeId, filePaths.length)
    await uploadCompleted
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await webContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[type="file"]')
        return Boolean(input && input.files && input.files.length >= ${filePaths.length})
      })()`)
      if (ready === true) return
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('CHATGPT_REFERENCE_UPLOAD_TIMEOUT')
  } finally {
    if (attachedHere) webContents.debugger.detach()
  }
}

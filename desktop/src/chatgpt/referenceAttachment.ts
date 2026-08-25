interface DebuggerLike {
  isAttached(): boolean
  attach(version?: string): void
  detach(): void
  sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>
}

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

export async function attachReferenceFile(
  webContents: AttachmentWebContents,
  filePath: string,
): Promise<void> {
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
    await webContents.debugger.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files: [filePath],
    })
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const ready = await webContents.executeJavaScript(`(() => {
        const input = document.querySelector('input[type="file"]')
        return Boolean(input && input.files && input.files.length > 0)
      })()`)
      if (ready === true) return
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('CHATGPT_REFERENCE_UPLOAD_TIMEOUT')
  } finally {
    if (attachedHere) webContents.debugger.detach()
  }
}


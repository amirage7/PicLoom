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

const ATTACHMENT_READY_ATTEMPTS = 40
const ATTACHMENT_READY_INTERVAL_MS = 150

export async function waitForReferenceAttachment(
  probe: () => Promise<boolean>,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<void> {
  for (let attempt = 0; attempt < ATTACHMENT_READY_ATTEMPTS; attempt += 1) {
    if (await probe()) return
    await wait(ATTACHMENT_READY_INTERVAL_MS)
  }
  throw new Error('CHATGPT_REFERENCE_UPLOAD_TIMEOUT')
}

export function hasVisibleAttachmentSignal(labels: string[], previewCount: number): boolean {
  if (previewCount > 0) return true
  return labels.some((label) => ['remove', 'delete', '移除', '删除'].some((term) => label.toLowerCase().includes(term)))
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
    await webContents.debugger.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files: filePaths,
    })
    await waitForReferenceAttachment(async () => {
      const ready = await webContents.executeJavaScript(`(() => {
        const hasVisibleAttachmentSignal = ${hasVisibleAttachmentSignal.toString()}
        const input = document.querySelector('input[type="file"]')
        if (!input?.files || input.files.length < ${filePaths.length}) return false
        const composer = input.closest('form') || input.parentElement?.parentElement || document
        const controls = Array.from(composer.querySelectorAll('button, [role="button"], [data-testid]'))
        const labels = controls.map((element) => [
            element.getAttribute('aria-label'),
            element.getAttribute('data-testid'),
            element.getAttribute('title'),
            element.textContent,
          ].filter(Boolean).join(' '))
        return hasVisibleAttachmentSignal(
          labels,
          composer.querySelectorAll('img, [data-testid*="attachment"][data-testid*="preview"]').length,
        )
      })()`)
      return ready === true
    })
  } finally {
    if (attachedHere) webContents.debugger.detach()
  }
}

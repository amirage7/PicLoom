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

async function locateComposerFileInput(webContents: AttachmentWebContents): Promise<number> {
  const prepared = await webContents.executeJavaScript(`(async () => {
    const composer = document.querySelector('#prompt-textarea, textarea[data-testid*="composer"], [contenteditable="true"][data-testid*="composer"]')
    if (!composer) return false
    const scope = composer.closest('form') || composer.parentElement?.parentElement
    if (!scope) return false
    document.querySelectorAll('[data-aic-reference-target], [data-aic-reference-composer]').forEach((element) => {
      element.removeAttribute('data-aic-reference-target')
      element.removeAttribute('data-aic-reference-composer')
    })
    scope.setAttribute('data-aic-reference-composer', 'true')
    const matchesFileAction = (item) => {
      const label = (item.getAttribute('aria-label') || item.textContent || '').toLowerCase()
      return ['attach', 'upload', 'add', 'file', 'photo', '添加', '上传', '文件', '照片']
        .some((term) => label.includes(term))
    }
    const chooseCandidate = (candidates) =>
      candidates.find((input) => /image|png|jpeg|webp/i.test(input.accept || '')) || candidates[0]
    let input = chooseCandidate(Array.from(scope.querySelectorAll('input[type="file"]')))
    if (!input) {
      const existingInputs = new Set(document.querySelectorAll('input[type="file"]'))
      const trigger = Array.from(scope.querySelectorAll('button, [role="button"]')).find(matchesFileAction)
      trigger?.click()
      await new Promise((resolve) => setTimeout(resolve, 250))
      const newInputs = Array.from(document.querySelectorAll('input[type="file"]'))
        .filter((candidate) => !existingInputs.has(candidate))
      input = chooseCandidate(newInputs)
    }
    if (!input) return false
    input.setAttribute('data-aic-reference-target', 'true')
    return true
  })()`)
  if (prepared !== true) throw new Error('CHATGPT_COMPOSER_FILE_INPUT_NOT_FOUND')
  const documentResult = await webContents.debugger.sendCommand('DOM.getDocument') as { root?: { nodeId?: number } }
  const rootId = documentResult.root?.nodeId
  if (!rootId) throw new Error('CHATGPT_DOCUMENT_UNAVAILABLE')
  const query = await webContents.debugger.sendCommand('DOM.querySelector', {
    nodeId: rootId,
    selector: '[data-aic-reference-target="true"]',
  }) as { nodeId?: number }
  if (!query.nodeId) throw new Error('CHATGPT_COMPOSER_FILE_INPUT_NOT_FOUND')
  return query.nodeId
}

export async function attachReferenceFiles(
  webContents: AttachmentWebContents,
  filePaths: string[],
): Promise<void> {
  if (filePaths.length === 0) throw new Error('CHATGPT_REFERENCE_FILES_EMPTY')
  const attachedHere = !webContents.debugger.isAttached()
  if (attachedHere) webContents.debugger.attach('1.3')
  try {
    const nodeId = await locateComposerFileInput(webContents)
    await webContents.debugger.sendCommand('DOM.setFileInputFiles', {
      nodeId,
      files: filePaths,
    })
    await waitForReferenceAttachment(async () => {
      const ready = await webContents.executeJavaScript(`(() => {
        const hasVisibleAttachmentSignal = ${hasVisibleAttachmentSignal.toString()}
        const input = document.querySelector('[data-aic-reference-target="true"]')
        if (!input?.files || input.files.length < ${filePaths.length}) return false
        const composer = document.querySelector('[data-aic-reference-composer="true"]') || input.closest('form') || input.parentElement?.parentElement || document
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

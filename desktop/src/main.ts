import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, ipcMain, shell, WebContentsView } from 'electron'

import { BackendSupervisor } from './backendSupervisor.js'
import { ChatGptViewController } from './chatgptView.js'
import { inspectChatGptPage } from './chatgpt/adapter.js'
import { collectChatGptImages } from './chatgpt/download.js'
import { requestChatGptImageNames } from './chatgpt/imageNaming.js'
import { submitPrompt } from './chatgpt/promptSubmission.js'
import { attachReferenceFiles } from './chatgpt/referenceAttachment.js'
import { GenerationBackendClient } from './generationBackendClient.js'
import { GenerationOrchestrator } from './generationOrchestrator.js'
import { DEVELOPMENT_BACKEND_PORT, createMainWindowOptions, resolveRendererTarget } from './mainConfig.js'
import { registerDesktopIpc } from './ipc.js'
import {
  installNavigationSecurity,
  installSessionSecurity,
  isAllowedChatGptUrl,
  isAllowedRendererUrl,
} from './security.js'

let mainWindow: BrowserWindow | null = null
let chatGptController: ChatGptViewController | null = null
let backendSupervisor: BackendSupervisor | null = null
let generationOrchestrator: GenerationOrchestrator | null = null
let shutdownStarted = false
let shutdownComplete = false

function repositoryRoot(): string {
  return path.resolve(fileURLToPath(new URL('../../../', import.meta.url)))
}

async function probeBackend(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return response.ok
  } catch {
    return false
  }
}

function killWindowsProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve()
    }
    killer.once('exit', finish)
    killer.once('error', finish)
  })
}

async function createApplicationWindow(): Promise<void> {
  if (app.isPackaged) {
    process.env.AI_IMAGE_CANVAS_DATA_DIR = path.join(app.getPath('userData'), 'data')
  }
  backendSupervisor = new BackendSupervisor({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: repositoryRoot(),
    port: DEVELOPMENT_BACKEND_PORT,
    spawnProcess(command, args, cwd) {
      return spawn(command, args, {
        cwd,
        windowsHide: true,
        stdio: 'ignore',
      })
    },
    probe: probeBackend,
    ...(process.platform === 'win32' ? { killProcessTree: killWindowsProcessTree } : {}),
  })
  await backendSupervisor.start()

  const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url))
  mainWindow = new BrowserWindow(createMainWindowOptions(preloadPath))
  installSessionSecurity(mainWindow.webContents.session)
  installNavigationSecurity(mainWindow.webContents, isAllowedRendererUrl, shell.openExternal)

  const chatGptViews: WebContentsView[] = []
  chatGptController = new ChatGptViewController({
    parent: {
      addChildView(view) {
        mainWindow?.contentView.addChildView(view as WebContentsView)
      },
      removeChildView(view) {
        mainWindow?.contentView.removeChildView(view as WebContentsView)
      },
    },
    createView(options) {
      const view = new WebContentsView(options)
      chatGptViews.push(view)
      return view
    },
  })
  const chatGptView = chatGptViews[0]
  if (!chatGptView) throw new Error('Failed to create ChatGPT view')
  installSessionSecurity(chatGptView.webContents.session)
  installNavigationSecurity(chatGptView.webContents, isAllowedChatGptUrl, shell.openExternal)
  const generationBackend = new GenerationBackendClient(backendSupervisor.baseUrl)
  generationOrchestrator = new GenerationOrchestrator({
    view: chatGptController,
    inspect: inspectChatGptPage,
    submit: submitPrompt,
    attachReferences: async (webContents, imageIds) => {
      const directory = await mkdtemp(path.join(app.getPath('temp'), 'ai-image-canvas-ref-'))
      try {
        const filePaths: string[] = []
        for (const [index, imageId] of imageIds.entries()) {
          const image = await generationBackend.getImageFile(imageId)
          const filePath = path.join(directory, `${index + 1}-${path.basename(image.fileName)}`)
          try {
            await writeFile(filePath, image.bytes)
          } finally {
            image.bytes.fill(0)
          }
          filePaths.push(filePath)
        }
        await attachReferenceFiles(webContents as typeof chatGptView.webContents, filePaths)
      } catch (error) {
        await rm(directory, { recursive: true, force: true })
        throw error
      }
      return async () => rm(directory, { recursive: true, force: true })
    },
    collect: (sources, webContents, signal) => collectChatGptImages(
      sources,
      webContents,
      {
        sessionFetch: (url, init) => chatGptView.webContents.session.fetch(url, init),
        signal,
      },
    ),
    requestSuggestedName: (webContents, count, signal) =>
      requestChatGptImageNames(webContents, count, signal),
    backend: generationBackend,
    emit: (event) => mainWindow?.webContents.send('desktop:generation-event', event),
  })
  void chatGptController.loadHome().catch(() => undefined)
  registerDesktopIpc({
    ipcMain,
    view: chatGptController,
    orchestrator: generationOrchestrator,
    backendOnline: () => backendSupervisor !== null && !shutdownStarted,
    imageSaver: {
      async save({ imageId, fileName }) {
        const image = await generationBackend.getImageFile(imageId)
        try {
          const result = await dialog.showSaveDialog(mainWindow!, {
            defaultPath: path.basename(fileName || image.fileName),
            title: '保存原图',
          })
          if (result.canceled || !result.filePath) return { saved: false }
          await writeFile(result.filePath, image.bytes)
          return { saved: true, filePath: result.filePath }
        } finally {
          image.bytes.fill(0)
        }
      },
    },
  })

  const developmentUrl = process.env.VITE_DEV_SERVER_URL
  const rendererTarget = resolveRendererTarget({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    ...(developmentUrl ? { developmentUrl } : {}),
  })
  if (rendererTarget.kind === 'url') {
    await mainWindow.loadURL(rendererTarget.value)
  } else {
    await mainWindow.loadFile(rendererTarget.value)
  }
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.on('closed', () => {
    void generationOrchestrator?.shutdown()
    chatGptController?.destroy()
    chatGptController = null
    generationOrchestrator = null
    mainWindow = null
  })
}

function beginShutdown(event: Electron.Event): void {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  void generationOrchestrator?.shutdown()
  chatGptController?.destroy()
  void backendSupervisor?.stop().finally(() => {
    shutdownComplete = true
    app.quit()
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.on('before-quit', beginShutdown)
  app.whenReady()
    .then(createApplicationWindow)
    .catch((error: unknown) => {
      console.error('AI Image Canvas desktop failed to start', error)
      app.quit()
    })
}

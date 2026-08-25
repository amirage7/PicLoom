import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, ipcMain, shell, WebContentsView } from 'electron'

import { BackendSupervisor } from './backendSupervisor.js'
import { ChatGptViewController } from './chatgptView.js'
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

async function createApplicationWindow(): Promise<void> {
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
  })
  await backendSupervisor.start()

  const preloadPath = fileURLToPath(new URL('./preload.js', import.meta.url))
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
  void chatGptController.loadHome().catch(() => undefined)
  registerDesktopIpc({
    ipcMain,
    view: chatGptController,
    backendOnline: () => backendSupervisor !== null && !shutdownStarted,
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
    chatGptController?.destroy()
    chatGptController = null
    mainWindow = null
  })
}

function beginShutdown(event: Electron.Event): void {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
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

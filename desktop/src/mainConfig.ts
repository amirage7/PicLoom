import path from 'node:path'

import type { BrowserWindowConstructorOptions } from 'electron'

export const DEVELOPMENT_BACKEND_PORT = 8001

export function createMainWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1500,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#080d0c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  }
}

interface RendererTargetOptions {
  packaged: boolean
  resourcesPath: string
  developmentUrl?: string
}

export function resolveRendererTarget(
  options: RendererTargetOptions,
): { kind: 'url' | 'file'; value: string } {
  if (options.packaged) {
    return {
      kind: 'file',
      value: path.join(options.resourcesPath, 'frontend', 'dist', 'index.html'),
    }
  }

  const developmentUrl = options.developmentUrl ?? 'http://127.0.0.1:3000'
  if (developmentUrl !== 'http://127.0.0.1:3000') {
    throw new Error('Development renderer must use http://127.0.0.1:3000')
  }
  return { kind: 'url', value: developmentUrl }
}

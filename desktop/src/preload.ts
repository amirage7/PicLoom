import { contextBridge, ipcRenderer } from 'electron'

import { createDesktopBridge } from './preloadBridge.js'

contextBridge.exposeInMainWorld(
  'aiImageCanvasDesktop',
  createDesktopBridge(ipcRenderer),
)

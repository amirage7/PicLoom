/// <reference types="vite/client" />

import type { DesktopBridgeApi } from './features/desktop/types'

declare global {
  interface Window {
    aiImageCanvasDesktop?: DesktopBridgeApi
  }
}

export interface DownloadEventLike {
  preventDefault(): void
}

export interface SessionSecurityTarget {
  setPermissionRequestHandler(
    handler: (webContents: unknown, permission: string, callback: (allowed: boolean) => void) => void,
  ): void
  setPermissionCheckHandler(handler: (webContents: unknown, permission: string) => boolean): void
  on(name: 'will-download', handler: (event: DownloadEventLike) => void): void
}

export interface WebContentsSecurityTarget {
  on(name: 'will-navigate', handler: (event: { preventDefault(): void }, url: string) => void): void
  setWindowOpenHandler(
    handler: (details: { url: string }) => { action: 'allow' | 'deny' },
  ): void
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function isHttpsHost(url: URL, hostname: string): boolean {
  return url.protocol === 'https:' && (url.hostname === hostname || url.hostname.endsWith(`.${hostname}`))
}

export function isAllowedRendererUrl(value: string): boolean {
  const url = parseUrl(value)
  if (!url) return false
  if (url.protocol === 'file:') return true
  return (
    url.protocol === 'http:'
    && url.hostname === '127.0.0.1'
    && (url.port === '3000' || url.port === '8000')
  )
}

export function isAllowedLoginUrl(value: string): boolean {
  const url = parseUrl(value)
  return url !== null && isHttpsHost(url, 'openai.com')
}

export function isAllowedChatGptUrl(value: string): boolean {
  const url = parseUrl(value)
  if (!url) return false
  return isHttpsHost(url, 'chatgpt.com') || isAllowedLoginUrl(value)
}

export function installSessionSecurity(target: SessionSecurityTarget): {
  allowNextDownload(): void
} {
  let allowOneDownload = false
  target.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  target.setPermissionCheckHandler(() => false)
  target.on('will-download', (event) => {
    if (allowOneDownload) {
      allowOneDownload = false
      return
    }
    event.preventDefault()
  })
  return {
    allowNextDownload() {
      allowOneDownload = true
    },
  }
}

export function installNavigationSecurity(
  target: WebContentsSecurityTarget,
  isAllowed: (url: string) => boolean,
  openExternal: (url: string) => Promise<void>,
): void {
  target.on('will-navigate', (event, url) => {
    if (!isAllowed(url)) event.preventDefault()
  })
  target.setWindowOpenHandler(({ url }) => {
    const parsed = parseUrl(url)
    if (parsed?.protocol === 'https:') void openExternal(url)
    return { action: 'deny' }
  })
}

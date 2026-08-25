export const CHATGPT_ADAPTER_VERSION = '2026-08-25.1'

export type PageState =
  | { kind: 'login_required'; reason: string }
  | { kind: 'ready' }
  | { kind: 'generating' }
  | { kind: 'completed'; images: Array<{ src: string; alt: string }> }
  | { kind: 'refused'; reason: string }
  | { kind: 'rate_limited'; reason: string }
  | { kind: 'page_changed'; diagnostics: string }


function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^$()|[\]{}]/g, '\\$&')
  const match = new RegExp(`${escaped}=["']([^"']*)["']`, 'i').exec(source)
  return match?.[1] ?? null
}

function assistantArticles(html: string): Array<{ attributes: string; body: string }> {
  const articles: Array<{ attributes: string; body: string }> = []
  const pattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? ''
    if (attribute(attributes, 'data-message-author-role') === 'assistant') {
      articles.push({ attributes, body: match[2] ?? '' })
    }
  }
  return articles
}

function generatedImages(html: string): Array<{ src: string; alt: string }> {
  const images: Array<{ src: string; alt: string }> = []
  const pattern = /<img\b([^>]*)>/gi
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? ''
    const testId = attribute(attributes, 'data-testid') ?? ''
    const alt = attribute(attributes, 'alt') ?? ''
    const src = attribute(attributes, 'src')
    if (!src || (!testId.includes('generated-image') && !/^Generated image/i.test(alt))) continue
    images.push({ src, alt })
  }
  return images
}

export function inspectFixtureHtml(
  html: string,
  assistantResponseIdsBefore: string[],
): PageState {
  if (/data-testid=["']login-button["']|href=["'][^"']*auth\/login/i.test(html)) {
    return { kind: 'login_required', reason: 'ChatGPT login is required' }
  }
  if (/data-testid=["']usage-limit["']|reached the current usage limit/i.test(html)) {
    return { kind: 'rate_limited', reason: 'ChatGPT usage limit reached' }
  }
  if (/aria-label=["'][^"']*Stop generating|data-testid=["']stop-button/i.test(html)) {
    return { kind: 'generating' }
  }

  const articles = assistantArticles(html)
  if (articles.some((article) => /data-aic-refusal=["']true["']/i.test(article.attributes))) {
    return { kind: 'refused', reason: 'The request was refused' }
  }

  const baseline = new Set(assistantResponseIdsBefore)
  const images = articles
    .filter((article) => {
      const identifier = attribute(article.attributes, 'data-message-id')
      return identifier === null || !baseline.has(identifier)
    })
    .flatMap((article) => generatedImages(article.body))
  if (images.length > 0) return { kind: 'completed', images }

  if (/id=["']prompt-textarea["']|data-testid=["']composer/i.test(html)) {
    return { kind: 'ready' }
  }
  return {
    kind: 'page_changed',
    diagnostics: `Adapter ${CHATGPT_ADAPTER_VERSION}: composer not found`,
  }
}

function runtimeInspectPage(assistantResponseIdsBefore: string[]): PageState {
  const login = document.querySelector(
    '[data-testid="login-button"], a[href*="/auth/login"], button[data-testid*="login"]',
  )
  if (login) return { kind: 'login_required', reason: 'ChatGPT login is required' }

  const visibleText = document.body?.innerText ?? ''
  if (/usage limit|limit reached|try again later/i.test(visibleText)) {
    return { kind: 'rate_limited', reason: 'ChatGPT usage limit reached' }
  }

  const stop = document.querySelector(
    'button[aria-label*="Stop"], button[data-testid*="stop"], [data-testid="stop-button"]',
  )
  if (stop) return { kind: 'generating' }

  const baseline = new Set(assistantResponseIdsBefore)
  const assistantResponses = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-message-author-role="assistant"]',
  ))
  const newResponses = assistantResponses.filter((response) => {
    const identifier = response.dataset.messageId ?? response.id
    return !identifier || !baseline.has(identifier)
  })

  for (const response of newResponses) {
    const text = response.innerText
    if (
      response.dataset.aicRefusal === 'true'
      || /cannot help with that request|can't assist with that request/i.test(text)
    ) {
      return { kind: 'refused', reason: 'The request was refused' }
    }
  }

  const images = newResponses.flatMap((response) => Array.from(response.querySelectorAll<HTMLImageElement>(
    'img[data-testid*="generated"], [data-testid*="generated"] img, img[alt*="Generated image"]',
  )).map((image) => ({ src: image.currentSrc || image.src, alt: image.alt || '' })))
    .filter((image) => /^(blob:|data:image\/|https:\/\/)/i.test(image.src))
  if (images.length > 0) return { kind: 'completed', images }

  const composer = document.querySelector(
    '#prompt-textarea, textarea[data-testid*="composer"], [contenteditable="true"][data-testid*="composer"]',
  )
  if (composer) return { kind: 'ready' }

  return {
    kind: 'page_changed',
    diagnostics: 'Adapter 2026-08-25.1: composer not found',
  }
}

export function createInspectPageScript(assistantResponseIdsBefore: string[]): string {
  return `(${runtimeInspectPage.toString()})(${JSON.stringify(assistantResponseIdsBefore)})`
}

interface InspectableWebContents {
  executeJavaScript(script: string): Promise<unknown>
}

function isPageState(value: unknown): value is PageState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Partial<PageState>
  if (state.kind === 'ready' || state.kind === 'generating') return true
  if (state.kind === 'completed') {
    return Array.isArray(state.images) && state.images.every((image) => (
      typeof image === 'object' && image !== null
      && typeof (image as { src?: unknown }).src === 'string'
      && typeof (image as { alt?: unknown }).alt === 'string'
    ))
  }
  if (state.kind === 'login_required' || state.kind === 'refused' || state.kind === 'rate_limited') {
    return typeof state.reason === 'string'
  }
  return state.kind === 'page_changed' && typeof state.diagnostics === 'string'
}

export async function inspectChatGptPage(
  webContents: InspectableWebContents,
  assistantResponseIdsBefore: string[],
): Promise<PageState> {
  const result = await webContents.executeJavaScript(createInspectPageScript(assistantResponseIdsBefore))
  if (!isPageState(result)) {
    return {
      kind: 'page_changed',
      diagnostics: `Adapter ${CHATGPT_ADAPTER_VERSION}: invalid page result`,
    }
  }
  return result
}

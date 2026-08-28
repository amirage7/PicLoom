export const CHATGPT_ADAPTER_VERSION = '2026-08-26.1'

export type PageState =
  | { kind: 'login_required'; reason: string }
  | { kind: 'ready' }
  | { kind: 'generating' }
  | { kind: 'completed'; images: Array<{ src: string; alt: string }>; suggestedName?: string }
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

function fixtureText(html: string): string {
  return html
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
}

function refusalReason(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.slice(0, 240) || 'ChatGPT 未生成图片，可能因内容限制或请求未完成。'
}

// 允许名字跨越 innerText 的软换行延续；段落空行（\n\n）或 Markdown 标记行视作段间边界。
// 提取后压扁所有空白，再裁到 80 字符上限。
const SUGGESTED_NAME_PATTERN = /图片名称\s*[：:]\s*([\s\S]+?)(?=\n\s*\n|\n\s*[#>*\-]|\n---|\n\*\*\*|$)/i
const MAX_SUGGESTED_NAME_LENGTH = 80

function suggestedNameFromText(text: string): string | undefined {
  const match = SUGGESTED_NAME_PATTERN.exec(text)
  const raw = match?.[1]
  if (!raw) return undefined
  const value = raw.replace(/[\s\r\n]+/g, '').trim().slice(0, MAX_SUGGESTED_NAME_LENGTH)
  return value || undefined
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

function newLargeImages(html: string, imageSourcesBefore: string[]): Array<{ src: string; alt: string }> {
  const baseline = new Set(imageSourcesBefore)
  const images: Array<{ src: string; alt: string }> = []
  const pattern = /<img\b([^>]*)>/gi
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? ''
    const src = attribute(attributes, 'src')
    const width = Number(attribute(attributes, 'width') ?? 0)
    const height = Number(attribute(attributes, 'height') ?? 0)
    if (
      !src || baseline.has(src) || width < 256 || height < 256
      || !/^(blob:|data:image\/|https:\/\/)/i.test(src)
    ) continue
    images.push({ src, alt: attribute(attributes, 'alt') ?? '' })
  }
  return images
}

function withoutUserMessages(html: string): string {
  return html.replace(/<article\b([^>]*)>[\s\S]*?<\/article>/gi, (article, attributes: string) => (
    attribute(attributes, 'data-message-author-role') === 'user' ? '' : article
  ))
}

export function inspectFixtureHtml(
  html: string,
  assistantResponseIdsBefore: string[],
  imageSourcesBefore: string[] = [],
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
  const baseline = new Set(assistantResponseIdsBefore)
  const latestArticle = articles.filter((article, index) => {
    const identifier = attribute(article.attributes, 'data-message-id') || `assistant-index-${index}`
    return !baseline.has(identifier)
  }).at(-1)
  if (latestArticle) {
    const text = fixtureText(latestArticle.body)
    if (
      /data-aic-refusal=["']true["']/i.test(latestArticle.attributes)
      || /cannot help with that request|can't assist with that request/i.test(text)
    ) {
      return { kind: 'refused', reason: refusalReason(text) }
    }
  }

  const suggestedName = latestArticle
    ? suggestedNameFromText(fixtureText(latestArticle.body))
    : undefined
  const images = latestArticle ? generatedImages(latestArticle.body) : []
  if (images.length > 0) {
    return { kind: 'completed', images, ...(suggestedName ? { suggestedName } : {}) }
  }
  const unmarkedImages = latestArticle
    ? newLargeImages(latestArticle.body, imageSourcesBefore)
    : []
  if (unmarkedImages.length > 0) {
    return { kind: 'completed', images: unmarkedImages, ...(suggestedName ? { suggestedName } : {}) }
  }
  const pageImages = newLargeImages(withoutUserMessages(html), imageSourcesBefore)
  if (pageImages.length > 0) {
    return { kind: 'completed', images: pageImages, ...(suggestedName ? { suggestedName } : {}) }
  }

  if (/id=["']prompt-textarea["']|data-testid=["']composer/i.test(html)) {
    return { kind: 'ready' }
  }
  return {
    kind: 'page_changed',
    diagnostics: `Adapter ${CHATGPT_ADAPTER_VERSION}: composer not found`,
  }
}

function runtimeInspectPage(
  assistantResponseIdsBefore: string[],
  imageSourcesBefore: string[],
): PageState {
  const refusalReason = (text: string): string => {
    const compact = text.replace(/\s+/g, ' ').trim()
    return compact.slice(0, 240) || 'ChatGPT 未生成图片，可能因内容限制或请求未完成。'
  }
  const suggestedNameFromText = (text: string): string | undefined => {
    const match = /图片名称\s*[：:]\s*([\s\S]+?)(?=\n\s*\n|\n\s*[#>*\-]|\n---|\n\*\*\*|$)/i.exec(text)
    const raw = match?.[1]
    if (!raw) return undefined
    const value = raw.replace(/[\s\r\n]+/g, '').trim().slice(0, 80)
    return value || undefined
  }
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
  const newResponses = assistantResponses.filter((response, index) => {
    const identifier = response.dataset.messageId || response.id || `assistant-index-${index}`
    return !baseline.has(identifier)
  })
  const latestResponse = newResponses.at(-1)
  const suggestedName = latestResponse
    ? suggestedNameFromText(latestResponse.innerText)
    : undefined

  if (latestResponse) {
    const text = latestResponse.innerText
    if (
      latestResponse.dataset.aicRefusal === 'true'
      || /cannot help with that request|can't assist with that request/i.test(text)
    ) {
      return { kind: 'refused', reason: refusalReason(text) }
    }
  }

  const images = (latestResponse ? Array.from(latestResponse.querySelectorAll<HTMLImageElement>(
    'img[data-testid*="generated"], [data-testid*="generated"] img, img[alt*="Generated image"]',
  )).map((image) => ({ src: image.currentSrc || image.src, alt: image.alt || '' })) : [])
    .filter((image) => /^(blob:|data:image\/|https:\/\/)/i.test(image.src))
  if (images.length > 0) {
    return { kind: 'completed', images, ...(suggestedName ? { suggestedName } : {}) }
  }

  const imageBaseline = new Set(imageSourcesBefore)
  const unmarkedImages = (latestResponse
    ? Array.from(latestResponse.querySelectorAll<HTMLImageElement>('img')).map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt || '',
      width: image.naturalWidth,
      height: image.naturalHeight,
    }))
    : [])
    .filter((image) => (
      image.width >= 256 && image.height >= 256 && !imageBaseline.has(image.src)
      && /^(blob:|data:image\/|https:\/\/)/i.test(image.src)
    ))
    .map(({ src, alt }) => ({ src, alt }))
  if (unmarkedImages.length > 0) {
    return { kind: 'completed', images: unmarkedImages, ...(suggestedName ? { suggestedName } : {}) }
  }

  const pageImages = Array.from(document.querySelectorAll<HTMLImageElement>('img'))
    .filter((image) => !image.closest('[data-message-author-role="user"]'))
    .map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt || '',
      width: image.naturalWidth,
      height: image.naturalHeight,
    }))
    .filter((image) => (
      image.width >= 256 && image.height >= 256 && !imageBaseline.has(image.src)
      && /^(blob:|data:image\/|https:\/\/)/i.test(image.src)
    ))
    .map(({ src, alt }) => ({ src, alt }))
  if (pageImages.length > 0) {
    return { kind: 'completed', images: pageImages, ...(suggestedName ? { suggestedName } : {}) }
  }

  const composer = document.querySelector(
    '#prompt-textarea, textarea[data-testid*="composer"], [contenteditable="true"][data-testid*="composer"]',
  )
  if (composer) return { kind: 'ready' }

  return {
    kind: 'page_changed',
    diagnostics: 'Adapter 2026-08-26.1: composer not found',
  }
}

export function createInspectPageScript(
  assistantResponseIdsBefore: string[],
  imageSourcesBefore: string[] = [],
): string {
  return `(${runtimeInspectPage.toString()})(${JSON.stringify(assistantResponseIdsBefore)}, ${JSON.stringify(imageSourcesBefore)})`
}

interface InspectableWebContents {
  executeJavaScript(script: string): Promise<unknown>
}

function isPageState(value: unknown): value is PageState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Partial<PageState>
  if (state.kind === 'ready' || state.kind === 'generating') return true
  if (state.kind === 'completed') {
    return (state.suggestedName === undefined || typeof state.suggestedName === 'string')
      && Array.isArray(state.images) && state.images.every((image) => (
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
  imageSourcesBefore: string[] = [],
): Promise<PageState> {
  const result = await webContents.executeJavaScript(createInspectPageScript(assistantResponseIdsBefore, imageSourcesBefore))
  if (!isPageState(result)) {
    return {
      kind: 'page_changed',
      diagnostics: `Adapter ${CHATGPT_ADAPTER_VERSION}: invalid page result`,
    }
  }
  return result
}

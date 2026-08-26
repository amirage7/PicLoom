import { submitPrompt, type SubmissionReceipt } from './promptSubmission.js'

export const IMAGE_NAMING_PROMPT =
  '请只为你刚刚生成的最终图片拟定一个 2–12 个字符的简短中文名称。严格只回复“图片名称：名称”，不得生成或修改图片。'

// 单张沿用经典格式；多张要求 ChatGPT 按 图片名称1：… 图片名称2：… 依次列出。
export function buildImageNamingPrompt(count: number): string {
  const safe = Math.max(1, Math.floor(count))
  if (safe <= 1) return IMAGE_NAMING_PROMPT
  return (
    `请为你刚刚生成的 ${safe} 张图片分别拟定简短中文名称（每张 2–12 个字符）。`
    + '严格只回复如下格式，依次列出全部 '
    + `${safe} 个名称，不得生成或修改图片：\n`
    + '图片名称1：名称1\n'
    + '图片名称2：名称2\n'
    + `…\n图片名称${safe}：名称${safe}`
  )
}

const NAMING_TIMEOUT_MS = 30_000
const NAMING_POLL_INTERVAL_MS = 500

export interface NamingWebContents {
  executeJavaScript(script: string): Promise<unknown>
  getURL(): string
}

export type ImageNamePageState =
  | { kind: 'waiting' }
  | { kind: 'completed'; name: string; names?: string[] }
  | { kind: 'unavailable' }

export interface NamingDependencies {
  submit(webContents: NamingWebContents, prompt: string): Promise<SubmissionReceipt>
  inspect(webContents: NamingWebContents, assistantResponseIdsBefore: string[]): Promise<ImageNamePageState>
  wait(milliseconds: number, signal: AbortSignal): Promise<void>
  now(): number
}

function cancelled(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new Error('cancelled')
}

function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

function attribute(source: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^$()|[\]{}]/g, '\\$&')
  return new RegExp(`${escaped}=["']([^"']*)["']`, 'i').exec(source)?.[1] ?? null
}

function textContent(html: string): string {
  return html
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
}

// 允许名字跨越 innerText 的软换行延续；段落空行（\n\n）或 Markdown 标记行视作段间边界。
// 提取后压扁所有空白，再裁到 80 字符上限。
const SUGGESTED_NAME_PATTERN = /图片名称\s*[：:]\s*([\s\S]+?)(?=\n\s*\n|\n\s*[#>*\-]|\n---|\n\*\*\*|$)/i
const MAX_SUGGESTED_NAME_LENGTH = 80

function normalizeSuggestedName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const flattened = raw.replace(/[\s\r\n]+/g, '').trim()
  if (!flattened) return undefined
  return flattened.slice(0, MAX_SUGGESTED_NAME_LENGTH)
}

// 多张图命名：匹配 图片名称1：… 图片名称2：… 等带序号的标签。
// 捕获组允许跨 innerText 软换行延续；下一段序号标签、空行或 Markdown 标记视为边界。
const NUMBERED_NAME_PATTERN = /图片名称\s*(\d+)\s*[：:]\s*([\s\S]*?)(?=\s*图片名称\s*\d+\s*[：:]|\s*\n\s*\n|\s*\n\s*[#>*\-]|\s*\n\s*---|\s*\n\s*\*\*\*|$)/gi

function extractSuggestedNames(text: string): string[] {
  const byIndex = new Map<number, string>()
  let maxIndex = 0
  for (const match of text.matchAll(NUMBERED_NAME_PATTERN)) {
    const index = Number(match[1])
    if (Number.isFinite(index) && index >= 1 && index <= 999) {
      const value = normalizeSuggestedName(match[2])
      if (value) {
        byIndex.set(index, value)
        maxIndex = Math.max(maxIndex, index)
      }
    }
  }
  if (byIndex.size === 0) {
    const single = normalizeSuggestedName(SUGGESTED_NAME_PATTERN.exec(text)?.[1])
    return single ? [single] : []
  }
  const result: string[] = []
  for (let index = 1; index <= maxIndex; index += 1) {
    result.push(byIndex.get(index) ?? '')
  }
  return result
}

export function inspectImageNameFixtureHtml(
  html: string,
  assistantResponseIdsBefore: string[],
): ImageNamePageState {
  if (/data-testid=["']login-button["']|href=["'][^"']*auth\/login/i.test(html)) {
    return { kind: 'unavailable' }
  }
  const baseline = new Set(assistantResponseIdsBefore)
  const responses: Array<{ id: string; body: string }> = []
  const pattern = /<article\b([^>]*)>([\s\S]*?)<\/article>/gi
  let assistantIndex = 0
  for (const match of html.matchAll(pattern)) {
    const attributes = match[1] ?? ''
    if (attribute(attributes, 'data-message-author-role') !== 'assistant') continue
    const id = attribute(attributes, 'data-message-id') || `assistant-index-${assistantIndex}`
    assistantIndex += 1
    responses.push({ id, body: match[2] ?? '' })
  }
  const latest = responses.filter((response) => !baseline.has(response.id)).at(-1)
  const names = latest ? extractSuggestedNames(textContent(latest.body)) : []
  const name = names[0]
  if (name) {
    return { kind: 'completed', name, names }
  }
  if (latest && /id=["']prompt-textarea["']|data-testid=["']composer/i.test(html)) {
    return { kind: 'unavailable' }
  }
  return { kind: 'waiting' }
}

function runtimeInspectImageName(assistantResponseIdsBefore: string[]): ImageNamePageState {
  const login = document.querySelector(
    '[data-testid="login-button"], a[href*="/auth/login"], button[data-testid*="login"]',
  )
  if (login) return { kind: 'unavailable' }

  const baseline = new Set(assistantResponseIdsBefore)
  const responses = Array.from(document.querySelectorAll<HTMLElement>(
    '[data-message-author-role="assistant"]',
  ))
  const latest = responses.filter((response, index) => {
    const identifier = response.dataset.messageId || response.id || `assistant-index-${index}`
    return !baseline.has(identifier)
  }).at(-1)
  if (latest) {
    const innerText = latest.innerText ?? ''
    const byIndex = new Map()
    const numbered = /图片名称\s*(\d+)\s*[：:]\s*([\s\S]*?)(?=\s*图片名称\s*\d+\s*[：:]|\s*\n\s*\n|\s*\n\s*[#>*\-]|\s*\n\s*---|\s*\n\s*\*\*\*|$)/gi
    for (const m of innerText.matchAll(numbered)) {
      const idx = Number(m[1])
      const value = (m[2] ?? '').replace(/[\s\r\n]+/g, '').trim().slice(0, 80)
      if (value) byIndex.set(idx, value)
    }
    let names: string[] = []
    if (byIndex.size > 0) {
      const maxIdx = Math.max.apply(null, Array.from(byIndex.keys()))
      for (let i = 1; i <= maxIdx; i += 1) names.push(byIndex.get(i) ?? '')
    } else {
      const single = /图片名称\s*[：:]\s*([\s\S]+?)(?=\n\s*\n|\n\s*[#>*\-]|\n---|\n\*\*\*|$)/i.exec(innerText)
      const name = single ? (single[1] ?? '').replace(/[\s\r\n]+/g, '').trim().slice(0, 80) : undefined
      if (name) names = [name]
    }
    if (names.length > 0) return { kind: 'completed', name: names[0] ?? '', names }
    const composer = document.querySelector(
      '#prompt-textarea, textarea[data-testid*="composer"], [contenteditable="true"][data-testid*="composer"]',
    )
    const stop = document.querySelector(
      'button[aria-label*="Stop"], button[data-testid*="stop"], [data-testid="stop-button"]',
    )
    if (composer && !stop) return { kind: 'unavailable' }
  }
  return { kind: 'waiting' }
}

export function createImageNameInspectionScript(assistantResponseIdsBefore: string[]): string {
  return `(${runtimeInspectImageName.toString()})(${JSON.stringify(assistantResponseIdsBefore)})`
}

export async function inspectImageNamePage(
  webContents: NamingWebContents,
  assistantResponseIdsBefore: string[],
): Promise<ImageNamePageState> {
  const result = await webContents.executeJavaScript(
    createImageNameInspectionScript(assistantResponseIdsBefore),
  )
  if (typeof result !== 'object' || result === null) return { kind: 'unavailable' }
  const state = result as Partial<ImageNamePageState>
  if (state.kind === 'waiting' || state.kind === 'unavailable') return { kind: state.kind }
  if (state.kind === 'completed' && typeof state.name === 'string' && state.name.trim()) {
    return { kind: 'completed', name: state.name.trim() }
  }
  return { kind: 'unavailable' }
}

const defaultDependencies: NamingDependencies = {
  submit: submitPrompt,
  inspect: inspectImageNamePage,
  wait: defaultWait,
  now: Date.now,
}

export async function requestChatGptImageNames(
  webContents: NamingWebContents,
  count: number,
  signal: AbortSignal,
  dependencies: NamingDependencies = defaultDependencies,
): Promise<string[] | undefined> {
  cancelled(signal)
  let receipt: SubmissionReceipt
  try {
    receipt = await dependencies.submit(webContents, buildImageNamingPrompt(count))
  } catch (error) {
    cancelled(signal)
    return undefined
  }

  const startedAt = dependencies.now()
  while (dependencies.now() - startedAt < NAMING_TIMEOUT_MS) {
    cancelled(signal)
    const state = await dependencies.inspect(webContents, receipt.assistantResponseIdsBefore)
    if (state.kind === 'completed') {
      const names = state.names ?? (state.name ? [state.name] : [])
      if (names.length > 0) {
        const padded = names.slice(0, count)
        while (padded.length < count) padded.push('')
        return padded
      }
    }
    if (state.kind === 'unavailable') return undefined
    const elapsed = dependencies.now() - startedAt
    const remaining = NAMING_TIMEOUT_MS - elapsed
    await dependencies.wait(Math.min(NAMING_POLL_INTERVAL_MS, remaining), signal)
  }
  return undefined
}

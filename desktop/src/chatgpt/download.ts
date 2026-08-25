import { createHash } from 'node:crypto'

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_BATCH_BYTES = 80 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000

export interface ImageSource {
  src: string
  order: number
}

export interface CollectedImage {
  order: number
  sourceUrl: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  sha256: string
  bytes: Uint8Array
}

export type ImageCollectionErrorCode =
  | 'invalid_source'
  | 'unauthorized'
  | 'download_failed'
  | 'unsupported_image'
  | 'image_too_large'
  | 'batch_too_large'
  | 'timeout'
  | 'cancelled'

export class ImageCollectionError extends Error {
  constructor(
    readonly code: ImageCollectionErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ImageCollectionError'
  }
}

interface PageWebContents {
  executeJavaScript(script: string): Promise<unknown>
}

interface CollectionOptions {
  sessionFetch(input: string, init?: RequestInit): Promise<Response>
  signal?: AbortSignal
  timeoutMs?: number
}

interface PageFetchResult {
  ok: boolean
  status: number
  base64: string
}

function pageFetchImage(sourceUrl: string): Promise<PageFetchResult> {
  return fetch(sourceUrl, { credentials: 'include' }).then(async (response) => {
    let base64 = ''
    if (response.ok) {
      const bytes = new Uint8Array(await response.arrayBuffer())
      const chunks: string[] = []
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 0x8000)))
      }
      base64 = btoa(chunks.join(''))
    }
    return { ok: response.ok, status: response.status, base64 }
  })
}

export function createPageFetchScript(sourceUrl: string): string {
  return `(${pageFetchImage.toString()})(${JSON.stringify(sourceUrl)})`
}

function isPageFetchResult(value: unknown): value is PageFetchResult {
  if (typeof value !== 'object' || value === null) return false
  const result = value as Partial<PageFetchResult>
  return (
    typeof result.ok === 'boolean'
    && typeof result.status === 'number'
    && Number.isInteger(result.status)
    && typeof result.base64 === 'string'
  )
}

function decodeBase64(base64: string): Uint8Array {
  const estimatedBytes = Math.floor(base64.length * 3 / 4)
  if (estimatedBytes > MAX_IMAGE_BYTES + 2) {
    throw new ImageCollectionError('image_too_large', 'Generated image exceeds 20 MB')
  }
  try {
    return Uint8Array.from(Buffer.from(base64, 'base64'))
  } catch {
    throw new ImageCollectionError('download_failed', 'Generated image bytes are invalid')
  }
}

function decodeDataUrl(sourceUrl: string): Uint8Array {
  const match = /^data:image\/(?:png|jpeg|jpg|webp);base64,([a-z0-9+/=\s]+)$/i.exec(sourceUrl)
  if (!match?.[1]) throw new ImageCollectionError('invalid_source', 'Unsupported image data URL')
  return decodeBase64(match[1].replace(/\s/g, ''))
}

function sniffMimeType(bytes: Uint8Array): CollectedImage['mimeType'] {
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x45
    && bytes[10] === 0x42
    && bytes[11] === 0x50
  ) return 'image/webp'
  throw new ImageCollectionError('unsupported_image', 'Generated response is not PNG, JPEG, or WEBP')
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ImageCollectionError('cancelled', 'Image collection was cancelled')
}

async function runWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  throwIfCancelled(callerSignal)
  const controller = new AbortController()
  let timedOut = false
  const cancel = () => controller.abort(callerSignal?.reason)
  callerSignal?.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(new Error('timeout'))
  }, timeoutMs)
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })
    })
    return await Promise.race([operation(controller.signal), aborted])
  } catch (error) {
    if (callerSignal?.aborted) {
      throw new ImageCollectionError('cancelled', 'Image collection was cancelled')
    }
    if (timedOut) throw new ImageCollectionError('timeout', 'Image download timed out')
    throw error
  } finally {
    clearTimeout(timer)
    callerSignal?.removeEventListener('abort', cancel)
  }
}

async function fetchInPage(
  webContents: PageWebContents,
  sourceUrl: string,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Uint8Array> {
  const result = await runWithDeadline(
    async () => webContents.executeJavaScript(createPageFetchScript(sourceUrl)),
    signal,
    timeoutMs,
  )
  if (!isPageFetchResult(result)) {
    throw new ImageCollectionError('download_failed', 'ChatGPT returned invalid image bytes')
  }
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      throw new ImageCollectionError('unauthorized', 'ChatGPT image session is unauthorized')
    }
    throw new ImageCollectionError('download_failed', 'ChatGPT image download failed')
  }
  return decodeBase64(result.base64)
}

async function fetchHttps(
  webContents: PageWebContents,
  sourceUrl: string,
  options: CollectionOptions,
): Promise<Uint8Array> {
  let response: Response
  try {
    response = await runWithDeadline(
      (signal) => options.sessionFetch(sourceUrl, { signal, credentials: 'include' }),
      options.signal,
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    )
  } catch (error) {
    if (error instanceof ImageCollectionError) throw error
    return fetchInPage(webContents, sourceUrl, options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      return fetchInPage(webContents, sourceUrl, options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
    }
    throw new ImageCollectionError('download_failed', 'Generated image download failed')
  }
  const contentLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new ImageCollectionError('image_too_large', 'Generated image exceeds 20 MB')
  }
  const buffer = await runWithDeadline(
    async () => response.arrayBuffer(),
    options.signal,
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
  return new Uint8Array(buffer)
}

async function collectSource(
  source: ImageSource,
  webContents: PageWebContents,
  options: CollectionOptions,
): Promise<Uint8Array> {
  throwIfCancelled(options.signal)
  if (source.src.startsWith('data:')) return decodeDataUrl(source.src)
  if (source.src.startsWith('blob:')) {
    return fetchInPage(webContents, source.src, options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  }
  if (source.src.startsWith('https://')) return fetchHttps(webContents, source.src, options)
  throw new ImageCollectionError('invalid_source', 'Unsupported generated image source')
}

export async function collectChatGptImages(
  sources: ImageSource[],
  webContents: PageWebContents,
  options: CollectionOptions,
): Promise<CollectedImage[]> {
  const collected: CollectedImage[] = []
  const hashes = new Set<string>()
  let totalBytes = 0

  for (const source of [...sources].sort((left, right) => left.order - right.order)) {
    const bytes = await collectSource(source, webContents, options)
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new ImageCollectionError('image_too_large', 'Generated image exceeds 20 MB')
    }
    const mimeType = sniffMimeType(bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (hashes.has(sha256)) continue
    hashes.add(sha256)
    totalBytes += bytes.byteLength
    if (totalBytes > MAX_BATCH_BYTES) {
      throw new ImageCollectionError('batch_too_large', 'Generated image batch exceeds 80 MB')
    }
    collected.push({
      order: source.order,
      sourceUrl: source.src,
      mimeType,
      sha256,
      bytes,
    })
  }
  return collected
}

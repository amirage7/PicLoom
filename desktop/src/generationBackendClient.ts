import type { DesktopGenerationState } from './contracts.js'
import type { CollectedImage } from './chatgpt/download.js'

interface BatchInput {
  taskId: string
  batchId: string
  sourceUrl: string
  images: CollectedImage[]
  suggestedNames?: string[]
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { detail?: unknown }
    const detail = typeof body.detail === 'string' ? body.detail : `Local backend request failed (${response.status})`
    throw new Error(detail)
  }
  return response.json() as Promise<T>
}

function extensionFor(mimeType: CollectedImage['mimeType']): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/jpeg') return 'jpg'
  return 'webp'
}

export class GenerationBackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async getImageFile(imageId: string): Promise<{ bytes: Uint8Array; fileName: string }> {
    const response = await this.request(
      `${this.baseUrl}/api/images/${encodeURIComponent(imageId)}/content`,
      { headers: { Accept: 'image/*' } },
    )
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(detail || `Local backend request failed (${response.status})`)
    }
    const disposition = response.headers.get('Content-Disposition') ?? ''
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
    const quoted = disposition.match(/filename="([^"]+)"/i)?.[1]
    const fileName = encoded ? decodeURIComponent(encoded) : quoted ?? `image-${imageId}.png`
    return { bytes: new Uint8Array(await response.arrayBuffer()), fileName }
  }

  async updateState(
    taskId: string,
    state: DesktopGenerationState,
    message: string,
    pageUrl: string,
  ): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/api/generation-tasks/${encodeURIComponent(taskId)}/desktop-state`,
      {
        method: 'PATCH',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, message, last_page_url: pageUrl }),
      },
    )
    await responseJson(response)
  }

  async cancel(taskId: string): Promise<void> {
    const response = await this.request(
      `${this.baseUrl}/api/generation-tasks/${encodeURIComponent(taskId)}/cancel`,
      { method: 'POST', headers: { Accept: 'application/json' } },
    )
    await responseJson(response)
  }

  async completeBatch(input: BatchInput): Promise<{ imageIds: string[] }> {
    const body = new FormData()
    body.append('batch_id', input.batchId)
    body.append('source_url', input.sourceUrl)
    if (input.suggestedNames?.some((name) => name.trim())) {
      body.append('suggested_names', JSON.stringify(input.suggestedNames.map((name) => name ?? '')))
    }
    for (const image of [...input.images].sort((left, right) => left.order - right.order)) {
      const copy = Uint8Array.from(image.bytes)
      body.append(
        'files',
        new Blob([copy], { type: image.mimeType }),
        `chatgpt-${image.order + 1}.${extensionFor(image.mimeType)}`,
      )
    }
    const response = await this.request(
      `${this.baseUrl}/api/generation-tasks/${encodeURIComponent(input.taskId)}/complete-batch`,
      { method: 'POST', body, headers: { Accept: 'application/json' } },
    )
    const result = await responseJson<{ image_ids?: unknown }>(response)
    if (!Array.isArray(result.image_ids) || !result.image_ids.every((id) => typeof id === 'string')) {
      throw new Error('Local backend returned an invalid image batch')
    }
    return { imageIds: result.image_ids }
  }
}

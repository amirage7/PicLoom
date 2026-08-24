export const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
])

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024
export const MAX_UPLOAD_FILES = 20

interface FileValidationResult {
  valid: File[]
  errors: string[]
}

export function validateImageFiles(files: readonly File[]): FileValidationResult {
  const valid: File[] = []
  const errors: string[] = []

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      errors.push(`${file.name}：仅支持 PNG、JPG 和 WEBP`)
      continue
    }

    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`${file.name}：文件不能超过 20MB`)
      continue
    }

    if (valid.length < MAX_UPLOAD_FILES) {
      valid.push(file)
    }
  }

  if (files.length > MAX_UPLOAD_FILES) {
    errors.push(`一次最多添加 ${MAX_UPLOAD_FILES} 张图片`)
  }

  return { valid, errors }
}

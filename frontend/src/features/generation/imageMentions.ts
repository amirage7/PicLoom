export interface MentionImage {
  imageId: string
  name: string
  imageUrl: string
}

export interface ActiveMention {
  start: number
  end: number
  query: string
}

export interface ResolvedMention {
  imageId: string
  name: string
}

interface MentionMatch extends ResolvedMention {
  start: number
  end: number
}

const mentionBoundary = /[\s,，。！？!?；;:：()（）\[\]{}“”"'<>]/u

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
}

function mentionMatches(prompt: string, images: MentionImage[]): MentionMatch[] {
  const longestFirst = [...images].sort((left, right) => right.name.length - left.name.length)
  const byStart = new Map<number, MentionMatch>()
  for (const image of longestFirst) {
    const token = `@${image.name}`
    let start = prompt.indexOf(token)
    while (start >= 0) {
      if (!byStart.has(start)) {
        byStart.set(start, {
          imageId: image.imageId,
          name: image.name,
          start,
          end: start + token.length,
        })
      }
      start = prompt.indexOf(token, start + token.length)
    }
  }
  return [...byStart.values()].sort((left, right) => left.start - right.start)
}

export function findActiveMention(prompt: string, caret: number): ActiveMention | null {
  const boundedCaret = Math.max(0, Math.min(prompt.length, caret))
  const start = prompt.lastIndexOf('@', boundedCaret - 1)
  if (start < 0) return null
  const query = prompt.slice(start + 1, boundedCaret)
  if ([...query].some((character) => mentionBoundary.test(character))) return null
  return { start, end: boundedCaret, query }
}

export function insertMention(
  prompt: string,
  active: ActiveMention,
  name: string,
): { prompt: string; caret: number } {
  const token = `@${name}`
  return {
    prompt: `${prompt.slice(0, active.start)}${token}${prompt.slice(active.end)}`,
    caret: active.start + token.length,
  }
}

export function filterMentionCandidates(images: MentionImage[], query: string): MentionImage[] {
  const normalizedQuery = normalized(query)
  return images.filter((image) => normalized(image.name).includes(normalizedQuery))
}

export function resolveImageMentions(prompt: string, images: MentionImage[]): ResolvedMention[] {
  const seen = new Set<string>()
  const result: ResolvedMention[] = []
  for (const match of mentionMatches(prompt, images)) {
    if (seen.has(match.imageId)) continue
    seen.add(match.imageId)
    result.push({ imageId: match.imageId, name: match.name })
  }
  return result
}

export function findInvalidMentions(prompt: string, images: MentionImage[]): string[] {
  const validStarts = new Set(mentionMatches(prompt, images).map((match) => match.start))
  const invalid: string[] = []
  for (let index = 0; index < prompt.length; index += 1) {
    if (prompt[index] !== '@' || validStarts.has(index)) continue
    let end = index + 1
    while (end < prompt.length && !mentionBoundary.test(prompt[end])) end += 1
    const value = prompt.slice(index + 1, end)
    if (value && !invalid.includes(value)) invalid.push(value)
  }
  return invalid
}
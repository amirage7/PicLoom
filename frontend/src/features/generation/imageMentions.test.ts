import { describe, expect, it } from 'vitest'

import {
  filterMentionCandidates,
  findActiveMention,
  findInvalidMentions,
  insertMention,
  resolveImageMentions,
  type MentionImage,
} from './imageMentions'

const images: MentionImage[] = [
  { imageId: 'build', name: '假面骑士build', imageUrl: '/build.png' },
  { imageId: 'build-short', name: '假面骑士', imageUrl: '/build-short.png' },
  { imageId: 'sheep', name: '喜羊羊', imageUrl: '/sheep.png' },
]

describe('image mentions', () => {
  it('resolves longest names in text order and deduplicates repeated references', () => {
    expect(resolveImageMentions(
      '将@假面骑士build的身体和@喜羊羊的头部合成，最后参考@假面骑士build',
      images,
    )).toEqual([
      { imageId: 'build', name: '假面骑士build' },
      { imageId: 'sheep', name: '喜羊羊' },
    ])
  })

  it('finds and replaces the active mention at the caret', () => {
    const prompt = '创建 @喜 的新角色'
    const active = findActiveMention(prompt, 5)
    expect(active).toEqual({ start: 3, end: 5, query: '喜' })
    expect(insertMention(prompt, active!, '喜羊羊')).toEqual({
      prompt: '创建 @喜羊羊 的新角色',
      caret: 7,
    })
  })

  it('filters candidates using normalized case-insensitive text', () => {
    expect(filterMentionCandidates(images, 'BUILD').map((image) => image.imageId)).toEqual(['build'])
  })

  it('reports only unmatched at-sign references', () => {
    expect(findInvalidMentions('将@喜羊羊的头部与@不存在的角色组合', images)).toEqual(['不存在的角色组合'])
    expect(findInvalidMentions('先输入一个@', images)).toEqual([])
  })
})
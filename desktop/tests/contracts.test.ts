import { describe, expect, it } from 'vitest'

import type {
  DesktopGenerationEvent,
  DesktopGenerationRequest,
} from '../src/contracts'

describe('desktop IPC contracts', () => {
  it('round-trips a generation request and event as JSON', () => {
    const request: DesktopGenerationRequest = {
      taskId: 'task-1',
      projectId: 'project-1',
      prompt: '一朵白色山茶花',
      parentImageId: null,
    }
    const event: DesktopGenerationEvent = {
      taskId: 'task-1',
      state: 'completed',
      message: '已导入 2 张图片',
      imageIds: ['image-1', 'image-2'],
      recoverable: false,
    }

    expect(JSON.parse(JSON.stringify({ request, event }))).toEqual({ request, event })
  })
})

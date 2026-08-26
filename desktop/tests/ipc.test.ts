import { describe, expect, it, vi } from 'vitest'

import {
  IPC_CHANNELS,
  registerDesktopIpc,
  validateGenerationRequest,
  validateTaskId,
  validateViewCommand,
} from '../src/ipc.js'

describe('desktop IPC validation', () => {
  it('accepts a finite non-negative integer view rectangle', () => {
    expect(validateViewCommand({
      visible: true,
      bounds: { x: 0, y: 10, width: 640, height: 480 },
    })).toEqual({ visible: true, bounds: { x: 0, y: 10, width: 640, height: 480 } })
  })

  it.each([
    { visible: true, bounds: { x: -1, y: 0, width: 1, height: 1 } },
    { visible: true, bounds: { x: 0.5, y: 0, width: 1, height: 1 } },
    { visible: true, bounds: { x: 0, y: 0, width: Number.NaN, height: 1 } },
    { visible: 'yes' },
  ])('rejects malformed view command %#', (input) => {
    expect(() => validateViewCommand(input)).toThrow('INVALID_VIEW_COMMAND')
  })

  it('validates generation identifiers and Unicode prompt length', () => {
    expect(validateTaskId(' task-1 ')).toBe('task-1')
    expect(validateGenerationRequest({
      taskId: 'task-1', projectId: 'project-1', prompt: '🌸'.repeat(20_000), parentImageId: null, referenceImages: [], transparentBackground: false,
    }).prompt).toHaveLength(40_000)
    expect(() => validateGenerationRequest({
      taskId: 'task-1', projectId: 'project-1', prompt: '🌸'.repeat(20_001), parentImageId: null, referenceImages: [], transparentBackground: false,
    })).toThrow('INVALID_GENERATION_REQUEST')
    expect(() => validateTaskId('')).toThrow('INVALID_TASK_ID')
  })

  it('validates ordered named references and parent consistency', () => {
    const valid = {
      taskId: 'task-1',
      projectId: 'project-1',
      prompt: '组合角色',
      parentImageId: 'build',
      referenceImages: [
        { imageId: 'build', name: ' 假面骑士build ' },
        { imageId: 'sheep', name: '喜羊羊' },
      ],
      transparentBackground: true,
    }
    expect(validateGenerationRequest(valid)).toEqual({
      ...valid,
      referenceImages: [
        { imageId: 'build', name: '假面骑士build' },
        { imageId: 'sheep', name: '喜羊羊' },
      ],
    })

    expect(() => validateGenerationRequest({ ...valid, referenceImages: 'bad' }))
      .toThrow('INVALID_GENERATION_REQUEST')
    expect(() => validateGenerationRequest({
      ...valid,
      referenceImages: Array.from({ length: 13 }, (_, index) => ({ imageId: `image-${index}`, name: `图${index}` })),
    })).toThrow('INVALID_GENERATION_REQUEST')
    expect(() => validateGenerationRequest({
      ...valid,
      referenceImages: [{ imageId: 'build', name: '甲' }, { imageId: 'build', name: '乙' }],
    })).toThrow('INVALID_GENERATION_REQUEST')
    expect(() => validateGenerationRequest({ ...valid, parentImageId: 'sheep' }))
      .toThrow('INVALID_GENERATION_REQUEST')
    expect(() => validateGenerationRequest({ ...valid, transparentBackground: 'yes' }))
      .toThrow('INVALID_GENERATION_REQUEST')
    const { transparentBackground: _omitted, ...withoutTransparentBackground } = valid
    expect(() => validateGenerationRequest(withoutTransparentBackground))
      .toThrow('INVALID_GENERATION_REQUEST')
  })
})

describe('desktop IPC registration', () => {
  it('registers named handlers and delegates generation commands to the orchestrator', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => unknown>()
    const view = { show: vi.fn(), hide: vi.fn(), reload: vi.fn(), isVisible: vi.fn(() => false) }
    const orchestrator = {
      start: vi.fn(async () => undefined),
      cancel: vi.fn(async () => undefined),
      retryCollection: vi.fn(async () => undefined),
      getLastEvent: vi.fn(() => null),
    }
    registerDesktopIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      view,
      orchestrator,
      backendOnline: () => true,
    })

    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC_CHANNELS).sort())
    await expect(handlers.get(IPC_CHANNELS.runtimeStatus)?.({})).resolves.toEqual({
      backendOnline: true,
      chatgptVisible: false,
    })
    await expect(handlers.get(IPC_CHANNELS.reloadChatGpt)?.({})).resolves.toBeUndefined()
    expect(view.reload).toHaveBeenCalledOnce()
    await expect(handlers.get(IPC_CHANNELS.startGeneration)?.({}, {
      taskId: 'task-1', projectId: 'project-1', prompt: '一朵花', parentImageId: null, referenceImages: [], transparentBackground: false,
    })).resolves.toBeUndefined()
    expect(orchestrator.start).toHaveBeenCalledWith({
      taskId: 'task-1', projectId: 'project-1', prompt: '一朵花', parentImageId: null, referenceImages: [], transparentBackground: false,
    })
    await expect(handlers.get(IPC_CHANNELS.cancelGeneration)?.({}, '')).rejects.toThrow('INVALID_TASK_ID')
  })
})

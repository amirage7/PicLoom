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
      taskId: 'task-1', projectId: 'project-1', prompt: '🌸'.repeat(20_000), parentImageId: null,
    }).prompt).toHaveLength(40_000)
    expect(() => validateGenerationRequest({
      taskId: 'task-1', projectId: 'project-1', prompt: '🌸'.repeat(20_001), parentImageId: null,
    })).toThrow('INVALID_GENERATION_REQUEST')
    expect(() => validateTaskId('')).toThrow('INVALID_TASK_ID')
  })
})

describe('desktop IPC registration', () => {
  it('registers named handlers and keeps generation disabled until the orchestrator exists', async () => {
    const handlers = new Map<string, (_event: unknown, input?: unknown) => unknown>()
    const view = { show: vi.fn(), hide: vi.fn(), isVisible: vi.fn(() => false) }
    registerDesktopIpc({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      view,
      backendOnline: () => true,
    })

    expect([...handlers.keys()].sort()).toEqual(Object.values(IPC_CHANNELS).sort())
    await expect(handlers.get(IPC_CHANNELS.runtimeStatus)?.({})).resolves.toEqual({
      backendOnline: true,
      chatgptVisible: false,
    })
    await expect(handlers.get(IPC_CHANNELS.startGeneration)?.({}, {
      taskId: 'unknown-task', projectId: 'project-1', prompt: '一朵花', parentImageId: null,
    })).rejects.toThrow('DESKTOP_GENERATION_NOT_READY')
    await expect(handlers.get(IPC_CHANNELS.cancelGeneration)?.({}, '')).rejects.toThrow('INVALID_TASK_ID')
  })
})

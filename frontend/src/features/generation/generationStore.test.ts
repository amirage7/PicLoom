import { expect, it, vi } from 'vitest'

import {
  createGenerationStore,
  disposeDesktopGenerationEvents,
  ensureDesktopGenerationEvents,
} from './generationStore'
import type { DesktopBridgeApi } from '../desktop/types'
import type { ImageProvider } from './types'


it('keeps the prompt and error after a failed task', async () => {
  const provider = {
    id: 'chatgpt-web',
    getAvailability: vi.fn().mockResolvedValue({ paired: true, online: true, state: 'ready', chatUrl: null, extensionVersion: '0.1.0' }),
    generate: vi.fn().mockRejectedValue(new Error('请登录')),
    getTask: vi.fn(),
    cancel: vi.fn(),
  } satisfies ImageProvider
  const store = createGenerationStore(provider)

  await store.getState().generate('project-1', 'quiet observatory')

  expect(store.getState().prompt).toBe('quiet observatory')
  expect(store.getState().error).toBe('请登录')
})

it('stores the transparent-background option independently from the prompt', () => {
  const provider = {
    id: 'chatgpt-web',
    getAvailability: vi.fn(), generate: vi.fn(), getTask: vi.fn(), cancel: vi.fn(),
  } satisfies ImageProvider
  const store = createGenerationStore(provider)

  expect(store.getState().transparentBackground).toBe(false)
  store.getState().setTransparentBackground(true)

  expect(store.getState().transparentBackground).toBe(true)
  expect(store.getState().prompt).toBe('')
})

it('queues and atomically consumes a one-click generation action once', () => {
  const provider = {
    id: 'chatgpt-web',
    getAvailability: vi.fn(), generate: vi.fn(), getTask: vi.fn(), cancel: vi.fn(),
  } satisfies ImageProvider
  const store = createGenerationStore(provider)
  const action = {
    projectId: 'project-1',
    prompt: '@喜羊羊 移除此图像的背景。保持所有前景主体不变且完整无损，边缘干净平滑。将背景设为透明。',
    referenceImages: [{ imageId: 'image-1', name: '喜羊羊' }],
    transparentBackground: false,
  }

  store.getState().enqueueQuickAction(action)

  expect(store.getState().prompt).toBe(action.prompt)
  expect(store.getState().isPanelOpen).toBe(true)
  expect(store.getState().consumeQuickAction('project-1')).toMatchObject(action)
  expect(store.getState().consumeQuickAction('project-1')).toBeNull()
})

it('guards desktop generation ownership atomically until the matching task releases it', () => {
  const provider = {
    id: 'chatgpt-web',
    getAvailability: vi.fn(), generate: vi.fn(), getTask: vi.fn(), cancel: vi.fn(),
  } satisfies ImageProvider
  const store = createGenerationStore(provider)

  expect(store.getState().acquireDesktopGeneration()).toBe(true)
  expect(store.getState().acquireDesktopGeneration()).toBe(false)
  store.getState().bindDesktopTask('task-1')
  store.getState().releaseDesktopGeneration('another-task')
  expect(store.getState().desktopBusy).toBe(true)
  store.getState().releaseDesktopGeneration('task-1')
  expect(store.getState().desktopBusy).toBe(false)
})

it('ignores stale task events while a different desktop task owns the lock', () => {
  const provider = {
    id: 'chatgpt-web',
    getAvailability: vi.fn(), generate: vi.fn(), getTask: vi.fn(), cancel: vi.fn(),
  } satisfies ImageProvider
  const store = createGenerationStore(provider)

  expect(store.getState().acquireDesktopGeneration()).toBe(true)
  store.getState().handleDesktopGenerationEvent({
    taskId: 'task-old', state: 'completed', message: '旧任务完成', imageIds: [], recoverable: false,
  })
  expect(store.getState().desktopBusy).toBe(true)
  expect(store.getState().desktopEvent).toBeNull()
  store.getState().bindDesktopTask('task-current')
  store.getState().handleDesktopGenerationEvent({
    taskId: 'task-old', state: 'page_changed', message: '旧任务页面变化', imageIds: [], recoverable: true,
  })

  expect(store.getState().desktopBusy).toBe(true)
  expect(store.getState().desktopTaskId).toBe('task-current')
  expect(store.getState().desktopRecoverableTaskId).toBeNull()
  expect(store.getState().desktopEvent).toBeNull()

  store.getState().handleDesktopGenerationEvent({
    taskId: 'task-current', state: 'completed', message: '当前任务完成', imageIds: ['image-1'], recoverable: false,
  })
  expect(store.getState().desktopBusy).toBe(false)
  expect(store.getState().desktopTaskId).toBeNull()
  expect(store.getState().desktopEvent?.message).toBe('当前任务完成')
})

it('deduplicates, replaces, and explicitly disposes the module bridge subscription', () => {
  disposeDesktopGenerationEvents()
  const stopFirst = vi.fn()
  const stopSecond = vi.fn()
  const first = { onGenerationEvent: vi.fn(() => stopFirst) } as unknown as DesktopBridgeApi
  const second = { onGenerationEvent: vi.fn(() => stopSecond) } as unknown as DesktopBridgeApi

  ensureDesktopGenerationEvents(first)
  ensureDesktopGenerationEvents(first)
  expect(first.onGenerationEvent).toHaveBeenCalledOnce()

  ensureDesktopGenerationEvents(second)
  expect(stopFirst).toHaveBeenCalledOnce()
  expect(second.onGenerationEvent).toHaveBeenCalledOnce()

  disposeDesktopGenerationEvents()
  disposeDesktopGenerationEvents()
  expect(stopSecond).toHaveBeenCalledOnce()
})

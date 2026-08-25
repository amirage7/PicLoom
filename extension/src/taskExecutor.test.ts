import { describe, expect, it, vi } from 'vitest'

import { TaskExecutionError, executeTask, sendTaskMessage } from './taskExecutor'


const task = { id: 'task-1', prompt: 'quiet observatory' }


describe('executeTask', () => {
  it('stops without submitting when login is required', async () => {
    const adapter = {
      getState: vi.fn().mockReturnValue('login-required'),
      submitPrompt: vi.fn(),
    }

    await expect(executeTask(task, adapter, vi.fn())).rejects.toEqual(
      expect.objectContaining({ code: 'LOGIN_REQUIRED' }),
    )
    expect(adapter.submitPrompt).not.toHaveBeenCalled()
  })

  it('submits once and returns the completed image', async () => {
    const adapter = {
      getState: vi.fn().mockReturnValue('ready'),
      submitPrompt: vi.fn(),
    }
    const waitForImage = vi.fn().mockResolvedValue(new Blob(['image'], { type: 'image/png' }))

    const result = await executeTask(task, adapter, waitForImage)

    expect(adapter.submitPrompt).toHaveBeenCalledTimes(1)
    expect(result.type).toBe('image/png')
  })

  it('maps an unsupported page to a typed error', async () => {
    const adapter = { getState: vi.fn().mockReturnValue('unsupported'), submitPrompt: vi.fn() }
    await expect(executeTask(task, adapter, vi.fn())).rejects.toBeInstanceOf(TaskExecutionError)
  })
})
it('reloads an existing ChatGPT tab when its content script is missing', async () => {
  const tabs = {
    sendMessage: vi.fn()
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({ ok: true }),
    reload: vi.fn().mockResolvedValue(undefined),
  }
  const waitForReload = vi.fn().mockResolvedValue(undefined)

  const result = await sendTaskMessage<{ ok: boolean }>(tabs, 42, { type: 'execute-task' }, waitForReload)

  expect(tabs.reload).toHaveBeenCalledWith(42)
  expect(waitForReload).toHaveBeenCalledTimes(1)
  expect(tabs.sendMessage).toHaveBeenCalledTimes(2)
  expect(result.ok).toBe(true)
})
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { GenerationPanel } from './GenerationPanel'
import { useGenerationStore } from './generationStore'


beforeEach(() => useGenerationStore.setState({
  prompt: '', task: null, error: null, isPanelOpen: true,
  availability: { paired: false, online: false, state: 'unpaired', chatUrl: null, extensionVersion: null },
}))

afterEach(() => vi.useRealTimers())

it('shows pairing guidance while the extension is offline', () => {
  render(<GenerationPanel projectId="project-1" onCompleted={() => undefined} />)

  expect(screen.getByText('连接 ChatGPT')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '生成配对码' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '使用 ChatGPT 生成' })).toBeDisabled()
})

it('refreshes extension availability while the panel stays open', async () => {
  vi.useFakeTimers()
  const refreshAvailability = vi.fn().mockResolvedValue(undefined)
  useGenerationStore.setState({ refreshAvailability })

  render(<GenerationPanel projectId="project-1" onCompleted={() => undefined} />)
  expect(refreshAvailability).toHaveBeenCalledTimes(1)

  await act(async () => { await vi.advanceTimersByTimeAsync(3_000) })

  expect(refreshAvailability).toHaveBeenCalledTimes(2)
})

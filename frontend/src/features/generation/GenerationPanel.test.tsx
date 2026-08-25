import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'

import { GenerationPanel } from './GenerationPanel'
import { useGenerationStore } from './generationStore'


beforeEach(() => useGenerationStore.setState({
  prompt: '', task: null, error: null, isPanelOpen: true,
  availability: { paired: false, online: false, state: 'unpaired', chatUrl: null, extensionVersion: null },
}))


it('shows pairing guidance while the extension is offline', () => {
  render(<GenerationPanel projectId="project-1" onCompleted={() => undefined} />)

  expect(screen.getByText('连接 ChatGPT')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '生成配对码' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '使用 ChatGPT 生成' })).toBeDisabled()
})

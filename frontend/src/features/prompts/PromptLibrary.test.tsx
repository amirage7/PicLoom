import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../../app/store'
import { PromptLibrary } from './PromptLibraryPersisted'


describe('PromptLibrary management', () => {
  beforeEach(() => {
    useAppStore.setState({
      prompts: [{ id: 'prompt-one', title: '柔光摄影', content: 'Soft light', category: '摄影', createdTime: '2026-08-24' }],
      createPrompt: vi.fn().mockResolvedValue({ id: 'prompt' }),
      deletePrompt: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('creates a prompt from the editor', async () => {
    const user = userEvent.setup()
    render(<PromptLibrary />)
    await user.click(screen.getByRole('button', { name: '新建 Prompt' }))
    await user.type(screen.getByRole('textbox', { name: 'Prompt 标题' }), '柔光摄影')
    await user.type(screen.getByRole('textbox', { name: 'Prompt 内容' }), 'Soft light')
    await user.type(screen.getByRole('textbox', { name: 'Prompt 分类' }), '摄影')
    await user.click(screen.getByRole('button', { name: '保存 Prompt' }))
    expect(useAppStore.getState().createPrompt).toHaveBeenCalledWith({ title: '柔光摄影', content: 'Soft light', category: '摄影' })
  })

  it('requires confirmation before deleting a prompt', async () => {
    const user = userEvent.setup()
    render(<PromptLibrary />)
    await user.click(screen.getByRole('button', { name: '删除 柔光摄影' }))
    expect(useAppStore.getState().deletePrompt).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('确认删除？')
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(useAppStore.getState().deletePrompt).toHaveBeenCalledWith('prompt-one')
  })
})

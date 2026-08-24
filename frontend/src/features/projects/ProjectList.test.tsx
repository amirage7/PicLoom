import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../../app/store'
import { ProjectList } from './ProjectListPersisted'


describe('ProjectList management', () => {
  beforeEach(() => {
    useAppStore.setState({
      projects: [{ id: 'one', name: '项目一', createdTime: '2026-08-24', imageCount: 0 }, { id: 'two', name: '项目二', createdTime: '2026-08-24', imageCount: 0 }],
      activeProjectId: 'one',
      createProject: vi.fn().mockResolvedValue({ id: 'two' }),
      deleteProject: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('creates a project from the inline form', async () => {
    const user = userEvent.setup()
    render(<ProjectList />)
    await user.click(screen.getByRole('button', { name: '新建项目' }))
    await user.type(screen.getByRole('textbox', { name: '项目名称' }), '新项目')
    await user.click(screen.getByRole('button', { name: '创建项目' }))
    expect(useAppStore.getState().createProject).toHaveBeenCalledWith('新项目')
  })

  it('requires confirmation before deleting a project', async () => {
    const user = userEvent.setup()
    render(<ProjectList />)
    await user.click(screen.getByRole('button', { name: '管理 项目一' }))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(useAppStore.getState().deleteProject).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('删除“项目一”？')
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    expect(useAppStore.getState().deleteProject).toHaveBeenCalledWith('one')
  })

  it('teaches the first project action when the list is empty', async () => {
    useAppStore.setState({ projects: [] })
    const user = userEvent.setup()
    render(<ProjectList />)

    expect(screen.getByText('还没有项目')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '创建第一个项目' }))
    expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveFocus()
  })

  it('closes the project menu with Escape and restores focus', async () => {
    const user = userEvent.setup()
    render(<ProjectList />)
    const trigger = screen.getByRole('button', { name: '管理 项目一' })

    await user.click(trigger)
    expect(screen.getByRole('button', { name: '重命名' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('button', { name: '重命名' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('restores focus after canceling project creation', async () => {
    const user = userEvent.setup()
    render(<ProjectList />)
    const trigger = screen.getByRole('button', { name: '新建项目' })

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '取消新建项目' }))

    expect(trigger).toHaveFocus()
  })
})

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../app/store'
import { SaveStatus } from './SaveStatus'


describe('SaveStatus', () => {
  beforeEach(() => useAppStore.setState({ saveStatus: 'idle', error: null }))

  it.each([
    ['loading', '正在加载'], ['saving', '正在保存'], ['saved', '已保存'],
    ['error', '保存失败'], ['offline', '后端离线'],
  ] as const)('renders %s state', (status, label) => {
    useAppStore.setState({ saveStatus: status, error: status === 'error' ? '写入失败' : null })
    render(<SaveStatus onRetry={vi.fn()} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})

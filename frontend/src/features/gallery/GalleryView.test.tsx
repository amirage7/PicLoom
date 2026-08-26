import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppStore } from '../../app/store'
import { ImageInspector } from '../inspector/ImageInspector'
import * as resourcesApi from '../../lib/resourcesApi'
import { GalleryView } from './GalleryView'

vi.mock('../../lib/resourcesApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/resourcesApi')>('../../lib/resourcesApi')
  return {
    ...actual,
    listImages: vi.fn(),
    listUnarchivedImages: vi.fn(),
  }
})

const generatedImage: resourcesApi.ImageDto = {
  id: 'generated-image',
  project_id: 'project-one',
  image_path: 'images/project-one/generated.png',
  image_url: 'http://127.0.0.1:8001/api/images/generated-image/file',
  file_name: 'generated.png',
  name: '生成角色',
  prompt: '生成一个角色',
  tags: [],
  parent_id: null,
  source_ids: [],
  position_x: 0,
  position_y: 0,
  created_time: '2026-08-26T10:00:00Z',
  is_on_canvas: false,
  is_favorite: false,
  source_type: 'generated',
}

describe('GalleryView classifications and selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resourcesApi.listImages).mockResolvedValue([generatedImage])
    useAppStore.setState({
      activeProjectId: 'project-one',
      workspaceMode: 'project',
      projectView: 'gallery',
      isRightPanelOpen: true,
    })
  })

  it('uses provenance filters without Canvas membership categories', async () => {
    render(<GalleryView projectId="project-one" />)

    expect(await screen.findByText('生成角色')).toBeInTheDocument()
    const filters = within(document.querySelector('.gallery-filters') as HTMLElement)
    expect(filters.getByRole('button', { name: '全部' })).toBeInTheDocument()
    expect(filters.getByRole('button', { name: '收藏' })).toBeInTheDocument()
    expect(filters.getByRole('button', { name: '生成' })).toBeInTheDocument()
    expect(filters.getByRole('button', { name: '上传' })).toBeInTheDocument()
    expect(filters.queryByRole('button', { name: '画布中' })).not.toBeInTheDocument()
    expect(filters.queryByRole('button', { name: '未使用' })).not.toBeInTheDocument()
    expect(screen.getByText('ChatGPT 生成')).toBeInTheDocument()
    expect(screen.queryByText(/ChatGPT 生成 ·/)).not.toBeInTheDocument()
  })

  it('selects a gallery asset for the image inspector', async () => {
    const user = userEvent.setup()
    render(<><GalleryView projectId="project-one" /><ImageInspector /></>)

    await user.click(await screen.findByRole('button', { name: '生成角色' }))

    expect(screen.getByRole('complementary', { name: '图片详情' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看原图' })).toBeInTheDocument()
    expect(screen.getByAltText('generated.png')).toBeInTheDocument()
  })
})

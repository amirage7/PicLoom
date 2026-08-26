import { FolderInput, Heart, ImagePlus, MoreHorizontal, Search, Sparkles, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'
import * as resourcesApi from '../../lib/resourcesApi'
import type { ImageDto } from '../../lib/resourcesApi'
import { useCanvasStore } from '../canvas/store/canvasStore'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { useGenerationStore } from '../generation/generationStore'

type Filter = 'all' | 'favorite' | 'generated' | 'uploaded'
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'favorite', label: '收藏' },
  { id: 'generated', label: '生成' }, { id: 'uploaded', label: '上传' },
]

export function GalleryView({ projectId }: { projectId: string | null }) {
  const projects = useAppStore((state) => state.projects)
  const createProject = useAppStore((state) => state.createProject)
  const selectProject = useAppStore((state) => state.selectProject)
  const setProjectView = useAppStore((state) => state.setProjectView)
  const selectedGalleryImage = useAppStore((state) => state.selectedGalleryImage)
  const setSelectedGalleryImage = useAppStore((state) => state.setSelectedGalleryImage)
  const setRightPanelOpen = useAppStore((state) => state.setRightPanelOpen)
  const refreshUnarchivedCount = useAppStore((state) => state.refreshUnarchivedCount)
  const hydrateResources = useAppStore((state) => state.hydrateResources)
  const setGenerationPanelOpen = useGenerationStore((state) => state.setPanelOpen)
  const setGenerationPrompt = useGenerationStore((state) => state.setPrompt)
  const loadCanvas = useCanvasStore((state) => state.loadCanvas)
  const inputRef = useRef<HTMLInputElement>(null)
  const [images, setImages] = useState<ImageDto[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const values = projectId ? await resourcesApi.listImages(projectId) : await resourcesApi.listUnarchivedImages()
    setImages(values)
    if (!projectId) await refreshUnarchivedCount()
  }
  useEffect(() => { void load().catch(() => undefined) }, [projectId])
  useEffect(() => {
    const bridge = getDesktopBridge()
    if (!bridge) return
    return bridge.onGenerationEvent((event) => {
      if (event.state === 'completed') void load().catch(() => undefined)
    })
  }, [projectId])

  const visible = useMemo(() => images.filter((image) => {
    const matchesQuery = `${image.name} ${image.prompt} ${image.tags.join(' ')}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    if (!matchesQuery) return false
    if (filter === 'favorite') return image.is_favorite
    if (filter === 'generated') return image.source_type === 'generated'
    if (filter === 'uploaded') return image.source_type === 'uploaded'
    return true
  }), [filter, images, query])

  const patch = async (image: ImageDto, value: resourcesApi.ImagePatch) => {
    const updated = await resourcesApi.patchImage(image.id, value)
    setImages((items) => items.map((item) => item.id === image.id ? updated : item))
    if (selectedGalleryImage?.id === image.id) setSelectedGalleryImage(updated)
    if (projectId) await loadCanvas(projectId)
  }

  const moveTo = async (image: ImageDto, targetId: string) => {
    await resourcesApi.patchImage(image.id, { project_id: targetId })
    await load()
    await hydrateResources()
  }

  const createFrom = async (image: ImageDto) => {
    const name = window.prompt('新项目名称', image.name)
    if (!name?.trim()) return
    const project = await createProject(name.trim())
    await resourcesApi.patchImage(image.id, { project_id: project.id, is_on_canvas: true })
    selectProject(project.id); setProjectView('canvas'); await loadCanvas(project.id)
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        if (projectId) await resourcesApi.uploadImage(projectId, file, { prompt: '', positionX: 0, positionY: 0 })
        else await resourcesApi.uploadUnarchivedImage(file)
      }
      await load()
      if (projectId) await loadCanvas(projectId)
      await hydrateResources()
    } finally { setBusy(false) }
  }

  return (
    <section className="gallery-workspace" aria-label={projectId ? '项目图库' : '快速创作'}>
      <div className="gallery-hero">
        <div><h2>{projectId ? '项目图库' : '快速创作'}</h2><p>{projectId ? '浏览项目中的全部图片资产，并决定哪些进入画布。' : '随手生成或上传图片，不需要先创建项目。'}</p></div>
        <div className="gallery-primary-actions">
          <button type="button" onClick={() => setGenerationPanelOpen(true)}><Sparkles size={15} />使用 ChatGPT 生图</button>
          <button type="button" onClick={() => inputRef.current?.click()}><Upload size={15} />上传图片</button>
          <input ref={inputRef} className="visually-hidden" type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} />
        </div>
      </div>
      <div className="gallery-tools">
        <div className="gallery-filters">{filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}</div>
        <label className="gallery-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、Prompt 或标签" /></label>
      </div>
      {visible.length === 0 ? <div className="gallery-empty"><ImagePlus size={28} /><strong>{busy ? '正在导入…' : '这里还没有图片'}</strong><span>{projectId ? '上传或使用 ChatGPT 生成第一张项目图片。' : '从一个简单想法开始，之后再决定是否建立项目。'}</span></div> :
        <div className="gallery-grid">{visible.map((image) => <article className={`gallery-card ${selectedGalleryImage?.id === image.id ? 'gallery-card--selected' : ''}`} key={image.id}>
          <button className="gallery-preview" type="button" aria-pressed={selectedGalleryImage?.id === image.id} onClick={() => {
            setSelectedGalleryImage(image)
            setGenerationPanelOpen(false)
            setRightPanelOpen(true)
          }}><img src={image.image_url} alt={image.name} loading="lazy" /></button>
          <div className="gallery-card-meta"><div><strong title={image.name}>{image.name}</strong><small>{image.source_type === 'generated' ? 'ChatGPT 生成' : '本地上传'}</small></div><IconButton label={image.is_favorite ? '取消收藏' : '收藏'} isActive={image.is_favorite} onClick={() => void patch(image, { is_favorite: !image.is_favorite })}><Heart size={14} fill={image.is_favorite ? 'currentColor' : 'none'} /></IconButton></div>
          <div className="gallery-card-actions">
            {projectId ? <button type="button" onClick={() => void patch(image, { is_on_canvas: !image.is_on_canvas })}>{image.is_on_canvas ? '移出画布' : '加入画布'}</button> : <button type="button" onClick={() => { setGenerationPrompt(`@${image.name} `); setGenerationPanelOpen(true) }}>继续编辑</button>}
            <details><summary><MoreHorizontal size={14} /></summary><div className="gallery-card-menu">
              {!projectId && <button type="button" onClick={() => void createFrom(image)}>基于此图新建项目</button>}
              <strong><FolderInput size={12} />移动到项目</strong>{projects.filter((project) => project.id !== projectId).map((project) => <button type="button" key={project.id} onClick={() => void moveTo(image, project.id)}>{project.name}</button>)}
              <button className="danger-text" type="button" onClick={() => { if (window.confirm(`从本地删除“${image.name}”？`)) void resourcesApi.deleteImage(image.id).then(load).then(hydrateResources) }}><Trash2 size={12} />从项目删除</button>
            </div></details>
          </div>
        </article>)}</div>}
    </section>
  )
}

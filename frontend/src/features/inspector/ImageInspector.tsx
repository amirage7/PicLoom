import { Check, Copy, Download, Expand, Image, Info, Link2, Minus, Plus, Tags, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { IconButton } from '../../components/IconButton'
import { useAppStore } from '../../app/store'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { useCanvasStore } from '../canvas/store/canvasStore'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium', timeStyle: 'short', hour12: false,
  }).format(new Date(value))
}

interface ImageInspectorProps {
  id?: string
  onClose?: () => void
}

export function ImageInspector({ id, onClose }: ImageInspectorProps = {}) {
  const projectId = useAppStore((state) => state.activeProjectId)
  const canvas = useCanvasStore((state) => state.canvases[projectId])
  const selected = canvas?.nodes.find((node) => node.id === canvas.selectedNodeId)
  const updateImage = useCanvasStore((state) => state.updateImage)
  const duplicateNode = useCanvasStore((state) => state.duplicateNode)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const persistMetadata = useCanvasStore((state) => state.persistMetadata)
  const duplicatePersistedNode = useCanvasStore((state) => state.duplicatePersistedNode)
  const deletePersistedNode = useCanvasStore((state) => state.deletePersistedNode)
  const [prompt, setPrompt] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setPrompt(selected?.data.image.prompt ?? '')
    setTagsText(selected?.data.image.tags.join(', ') ?? '')
    setCopied(false)
    setConfirmingDelete(false)
    setViewerOpen(false)
    setZoom(100)
    setSaveError(null)
  }, [selected?.id, selected?.data.image.prompt, selected?.data.image.tags])

  useEffect(() => {
    if (!viewerOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerOpen(false)
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(400, value + 25))
      if (event.key === '-') setZoom((value) => Math.max(25, value - 25))
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [viewerOpen])

  const save = () => {
    if (!selected) return
    updateImage(projectId, selected.id, {
      prompt: prompt.trim() || '尚未添加 Prompt',
      tags: tagsText.split(/[,，]/),
    })
    if (selected.data.image.imageSource === 'stored') {
      void persistMetadata(projectId, selected.id, { prompt: prompt.trim() || '尚未添加 Prompt', tags: tagsText.split(/[,，]/) })
    }
  }

  const copyPrompt = async () => {
    if (!selected) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  const saveOriginal = async () => {
    if (!selected) return
    setSaveError(null)
    try {
      const bridge = getDesktopBridge()
      if (bridge?.saveImage) {
        await bridge.saveImage({ imageId: selected.id, fileName: selected.data.image.fileName })
        return
      }
      const response = await fetch(selected.data.image.imageUrl)
      if (!response.ok) throw new Error('图片下载失败')
      const href = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = href
      anchor.download = selected.data.image.fileName
      anchor.click()
      URL.revokeObjectURL(href)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '无法保存图片')
    }
  }

  return (
    <aside id={id} className="inspector-panel" aria-label="图片详情">
      <header className="inspector-header"><h2>图片详情</h2>{onClose && <IconButton className="compact-panel-close" label="关闭图片详情" onClick={onClose}><X size={15} /></IconButton>}</header>
      {!selected ? (
        <>
          <div className="inspector-empty">
            <div className="inspector-preview"><Image size={28} strokeWidth={1.4} /></div>
            <h3>未选择图片</h3>
            <p>选择画布中的图片后，可在这里查看和编辑 Prompt、标签与版本关系。</p>
          </div>
          <div className="inspector-skeleton" aria-hidden="true">
            <div className="skeleton-section"><span><Info size={14} /> 基本信息</span><div className="skeleton-line skeleton-line--wide" /><div className="skeleton-line" /></div>
            <div className="skeleton-section"><span><Tags size={14} /> 标签</span><div className="skeleton-tags"><i /><i /><i /></div></div>
          </div>
        </>
      ) : (
        <div className="inspector-content">
          <button className="inspector-image" type="button" aria-label="查看原图" onClick={() => setViewerOpen(true)}>
            <img src={selected.data.image.imageUrl} alt={selected.data.image.fileName} />
            <span><Expand size={14} />查看原图</span>
          </button>
          <div className="inspector-media-actions">
            <button type="button" onClick={() => void saveOriginal()}><Download size={14} />保存原图</button>
          </div>
          {saveError && <div className="inspector-save-error" role="alert">{saveError}</div>}
          <section className="inspector-section">
            <div className="inspector-section-title"><span><Info size={14} /> Prompt</span><button type="button" onClick={() => void copyPrompt()}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button></div>
            <textarea aria-label="图片 Prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} onBlur={save} rows={6} />
          </section>
          <section className="inspector-section">
            <div className="inspector-section-title"><span><Tags size={14} /> 标签</span></div>
            <input aria-label="图片标签" value={tagsText} onChange={(event) => setTagsText(event.target.value)} onBlur={save} placeholder="用逗号分隔标签" />
          </section>
          <section className="inspector-section inspector-metadata">
            <div className="inspector-section-title"><span><Link2 size={14} /> 版本关系</span></div>
            <dl>
              <div><dt>文件</dt><dd>{selected.data.image.fileName}</dd></div>
              <div><dt>创建</dt><dd>{formatDate(selected.data.image.createdTime)}</dd></div>
              <div><dt>父版本</dt><dd>{selected.data.image.parentId ? canvas.nodes.find((node) => node.id === selected.data.image.parentId)?.data.image.fileName ?? '已删除' : '初始版本'}</dd></div>
              <div><dt>子版本</dt><dd>{canvas.edges.filter((edge) => edge.source === selected.id).length}</dd></div>
            </dl>
          </section>
          <footer className="inspector-actions">
            <button type="button" onClick={() => selected.data.image.imageSource === 'stored' ? void duplicatePersistedNode(projectId, selected.id) : duplicateNode(projectId, selected.id)}><Copy size={14} />复制版本</button>
            {confirmingDelete ? (
              <div className="inspector-delete-confirm"><span>确定删除？</span><button type="button" onClick={() => selected.data.image.imageSource === 'stored' ? void deletePersistedNode(projectId, selected.id) : deleteNode(projectId, selected.id)}>删除</button><button type="button" onClick={() => setConfirmingDelete(false)}>取消</button></div>
            ) : (
              <button className="danger-text" type="button" onClick={() => setConfirmingDelete(true)}><Trash2 size={14} />删除</button>
            )}
          </footer>
        </div>
      )}
      {viewerOpen && selected && (
        <div className="image-viewer" role="dialog" aria-modal="true" aria-label={`查看 ${selected.data.image.fileName}`}>
          <header>
            <strong>{selected.data.image.fileName}</strong>
            <div>
              <button type="button" aria-label="缩小" onClick={() => setZoom((value) => Math.max(25, value - 25))}><Minus size={16} /></button>
              <span>{zoom}%</span>
              <button type="button" aria-label="放大" onClick={() => setZoom((value) => Math.min(400, value + 25))}><Plus size={16} /></button>
              <button type="button" onClick={() => setZoom(100)}>100%</button>
              <button type="button" onClick={() => void saveOriginal()}><Download size={15} />保存原图</button>
              <button type="button" aria-label="关闭原图" onClick={() => setViewerOpen(false)}><X size={17} /></button>
            </div>
          </header>
          <div className="image-viewer-stage" onWheel={(event) => {
            event.preventDefault()
            setZoom((value) => Math.max(25, Math.min(400, value + (event.deltaY < 0 ? 25 : -25))))
          }}>
            <img src={selected.data.image.imageUrl} alt={selected.data.image.fileName} style={{ width: `${zoom}%` }} />
          </div>
        </div>
      )}
    </aside>
  )
}

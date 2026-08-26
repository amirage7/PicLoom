import { Check, Copy, Download, Eraser, Expand, Image, Info, Link2, Minus, Plus, Tags, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { IconButton } from '../../components/IconButton'
import { useAppStore } from '../../app/store'
import * as resourcesApi from '../../lib/resourcesApi'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { nodeFromDto, useCanvasStore } from '../canvas/store/canvasStore'
import { useGenerationStore } from '../generation/generationStore'

const REMOVE_BACKGROUND_PROMPT = '移除此图像的背景。保持所有前景主体不变且完整无损，边缘干净平滑。将背景设为透明。'

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
  const selectedGalleryImage = useAppStore((state) => state.selectedGalleryImage)
  const setSelectedGalleryImage = useAppStore((state) => state.setSelectedGalleryImage)
  const canvas = useCanvasStore((state) => state.canvases[projectId])
  const canvasSelected = canvas?.nodes.find((node) => node.id === canvas.selectedNodeId)
  const selected = selectedGalleryImage ? nodeFromDto(selectedGalleryImage) : canvasSelected
  const updateImage = useCanvasStore((state) => state.updateImage)
  const duplicateNode = useCanvasStore((state) => state.duplicateNode)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const persistMetadata = useCanvasStore((state) => state.persistMetadata)
  const duplicatePersistedNode = useCanvasStore((state) => state.duplicatePersistedNode)
  const deletePersistedNode = useCanvasStore((state) => state.deletePersistedNode)
  const enqueueQuickAction = useGenerationStore((state) => state.enqueueQuickAction)
  const [imageName, setImageName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [zoom, setZoom] = useState<'fit' | number>('fit')
  const [saveError, setSaveError] = useState<string | null>(null)
  const sourceIds = selected?.data.image.sourceIds ?? (selected?.data.image.parentId ? [selected.data.image.parentId] : [])
  const sourceNames = sourceIds.map((sourceId) => canvas?.nodes.find((node) => node.id === sourceId)?.data.image.name ?? '已删除')

  useEffect(() => {
    setImageName(selected?.data.image.name ?? '')
    setNameError(null)
    setSavingName(false)
    setPrompt(selected?.data.image.prompt ?? '')
    setTagsText(selected?.data.image.tags.join(', ') ?? '')
    setCopied(false)
    setConfirmingDelete(false)
    setViewerOpen(false)
    setZoom('fit')
    setSaveError(null)
  }, [selected?.id, selected?.data.image.name, selected?.data.image.prompt, selected?.data.image.tags])

  useEffect(() => {
    if (!viewerOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerOpen(false)
      if (event.key === '+' || event.key === '=') {
        setZoom((value) => value === 'fit' ? 125 : Math.min(400, value + 25))
      }
      if (event.key === '-') {
        setZoom((value) => value === 'fit' ? value : Math.max(25, value - 25))
      }
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [viewerOpen])

  const save = () => {
    if (!selected) return
    const metadata = {
      prompt: prompt.trim() || '尚未添加 Prompt',
      tags: tagsText.split(/[,，]/).map((tag) => tag.trim()).filter((tag, index, values) => tag && values.indexOf(tag) === index),
    }
    if (selectedGalleryImage) {
      void resourcesApi.patchImage(selected.id, metadata).then(setSelectedGalleryImage).catch((error) => {
        setSaveError(error instanceof Error ? error.message : '图片信息保存失败')
      })
      return
    }
    updateImage(projectId, selected.id, {
      prompt: metadata.prompt,
      tags: metadata.tags,
    })
    if (selected.data.image.imageSource === 'stored') {
      void persistMetadata(projectId, selected.id, metadata)
    }
  }

  const saveName = async () => {
    if (!selected || savingName) return
    const nextName = imageName.trim()
    if (!nextName) {
      setNameError('图片名称不能为空')
      return
    }
    if ([...nextName].length > 80) {
      setNameError('图片名称不能超过 80 个字符')
      return
    }
    if (nextName === selected.data.image.name) {
      setImageName(nextName)
      setNameError(null)
      return
    }

    setSavingName(true)
    setNameError(null)
    try {
      if (selectedGalleryImage) {
        const updated = await resourcesApi.patchImage(selected.id, { name: nextName })
        setSelectedGalleryImage(updated)
      } else if (selected.data.image.imageSource === 'stored') {
        await persistMetadata(projectId, selected.id, { name: nextName })
      } else {
        updateImage(projectId, selected.id, { name: nextName })
      }
      setImageName(nextName)
    } catch (error) {
      setNameError(error instanceof Error ? error.message : '图片名称保存失败')
    } finally {
      setSavingName(false)
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

  const removeBackground = () => {
    if (!selected) return
    const reference = { imageId: selected.id, name: selected.data.image.name }
    enqueueQuickAction({
      projectId: selectedGalleryImage?.project_id ?? projectId,
      prompt: `@${reference.name} ${REMOVE_BACKGROUND_PROMPT}`,
      referenceImages: [reference],
      transparentBackground: false,
    })
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
          <button className="inspector-image" type="button" aria-label="查看原图" onClick={() => { setZoom('fit'); setViewerOpen(true) }}>
            <img src={selected.data.image.imageUrl} alt={selected.data.image.fileName} />
            <span><Expand size={14} />查看原图</span>
          </button>
          <div className="inspector-media-actions">
            <button type="button" onClick={() => void saveOriginal()}><Download size={14} />保存原图</button>
            {getDesktopBridge() && (
              <button className="inspector-remove-background" type="button" onClick={removeBackground}>
                <Eraser size={14} />移除背景
              </button>
            )}
          </div>
          {saveError && <div className="inspector-save-error" role="alert">{saveError}</div>}
          <section className="inspector-section inspector-name-section">
            <div className="inspector-section-title">
              <span><Info size={14} /> 图片名称</span>
              {savingName && <small>保存中…</small>}
            </div>
            <input
              aria-label="图片名称"
              aria-invalid={nameError ? 'true' : undefined}
              value={imageName}
              onChange={(event) => { setImageName(event.target.value); setNameError(null) }}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
                if (event.key === 'Escape') {
                  setImageName(selected.data.image.name)
                  setNameError(null)
                }
              }}
            />
            {nameError && <div className="inspector-field-error" role="alert">{nameError}</div>}
          </section>
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
              <div><dt>来源图片</dt><dd title={sourceNames.join('、')}>{sourceNames.length ? sourceNames.join('、') : '无（初始图片）'}</dd></div>
              <div><dt>派生图片</dt><dd>{new Set((canvas?.edges ?? []).filter((edge) => edge.source === selected.id).map((edge) => edge.target)).size}</dd></div>
            </dl>
          </section>
          <footer className="inspector-actions">
            <button type="button" onClick={() => selectedGalleryImage
              ? void resourcesApi.duplicateImage(selected.id).then(setSelectedGalleryImage)
              : selected.data.image.imageSource === 'stored'
                ? void duplicatePersistedNode(projectId, selected.id)
                : duplicateNode(projectId, selected.id)
            }><Copy size={14} />复制版本</button>
            {confirmingDelete ? (
              <div className="inspector-delete-confirm"><span>确定删除？</span><button type="button" onClick={() => selectedGalleryImage
                ? void resourcesApi.deleteImage(selected.id).then(() => setSelectedGalleryImage(null))
                : selected.data.image.imageSource === 'stored'
                  ? void deletePersistedNode(projectId, selected.id)
                  : deleteNode(projectId, selected.id)
              }>删除</button><button type="button" onClick={() => setConfirmingDelete(false)}>取消</button></div>
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
              <button type="button" aria-label="缩小" onClick={() => setZoom((value) => value === 'fit' ? value : Math.max(25, value - 25))}><Minus size={16} /></button>
              <span>{zoom === 'fit' ? '适应' : `${zoom}%`}</span>
              <button type="button" aria-label="放大" onClick={() => setZoom((value) => value === 'fit' ? 125 : Math.min(400, value + 25))}><Plus size={16} /></button>
              <button type="button" onClick={() => setZoom('fit')}>适应窗口</button>
              <button type="button" onClick={() => setZoom(100)}>100%</button>
              <button type="button" onClick={() => void saveOriginal()}><Download size={15} />保存原图</button>
              <button type="button" aria-label="关闭原图" onClick={() => setViewerOpen(false)}><X size={17} /></button>
            </div>
          </header>
          <div className="image-viewer-stage" onWheel={(event) => {
            event.preventDefault()
            setZoom((value) => {
              if (value === 'fit') return event.deltaY < 0 ? 125 : value
              return Math.max(25, Math.min(400, value + (event.deltaY < 0 ? 25 : -25)))
            })
          }}>
            <img
              data-testid="original-image"
              data-fit={zoom === 'fit' ? 'true' : 'false'}
              className={zoom === 'fit' ? 'is-fit' : undefined}
              src={selected.data.image.imageUrl}
              alt={selected.data.image.fileName}
              style={zoom === 'fit' ? undefined : { width: `${zoom}%` }}
            />
          </div>
        </div>
      )}
    </aside>
  )
}

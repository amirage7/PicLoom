import { Check, Copy, Image, Info, Link2, Tags, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useAppStore } from '../../app/store'
import { useCanvasStore } from '../canvas/store/canvasStore'

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium', timeStyle: 'short', hour12: false,
  }).format(new Date(value))
}

export function ImageInspector() {
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

  useEffect(() => {
    setPrompt(selected?.data.image.prompt ?? '')
    setTagsText(selected?.data.image.tags.join(', ') ?? '')
    setCopied(false)
    setConfirmingDelete(false)
  }, [selected?.id, selected?.data.image.prompt, selected?.data.image.tags])

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

  return (
    <aside className="inspector-panel" aria-label="图片详情">
      <header className="inspector-header"><h2>图片详情</h2></header>
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
          <div className="inspector-image"><img src={selected.data.image.imageUrl} alt={selected.data.image.fileName} /></div>
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
    </aside>
  )
}

import { Copy, Library, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'
import type { Prompt } from '../../types/domain'


const emptyDraft = { title: '', content: '', category: '' }

export function PromptLibrary() {
  const prompts = useAppStore((state) => state.prompts)
  const createPrompt = useAppStore((state) => state.createPrompt)
  const editPrompt = useAppStore((state) => state.editPrompt)
  const duplicatePrompt = useAppStore((state) => state.duplicatePrompt)
  const deletePrompt = useAppStore((state) => state.deletePrompt)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [draft, setDraft] = useState(emptyDraft)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const edit = (prompt: Prompt) => { setEditingId(prompt.id); setDraft({ title: prompt.title, content: prompt.content, category: prompt.category }) }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const value = { title: draft.title.trim(), content: draft.content.trim(), category: draft.category.trim() as Prompt['category'] }
    if (!value.title || !value.content || !value.category) return
    const action = editingId === 'new' ? createPrompt(value) : editPrompt(editingId as string, value)
    void action.then(() => { setEditingId(null); setDraft(emptyDraft) })
  }

  return <section className="sidebar-section prompt-section" aria-labelledby="prompts-heading">
    <div className="section-heading-row"><h2 id="prompts-heading">Prompt Library</h2><IconButton label="新建 Prompt" onClick={() => { setEditingId('new'); setDraft(emptyDraft) }}><Plus size={15} /></IconButton></div>
    {editingId && <form className="prompt-editor" onSubmit={submit}><input aria-label="Prompt 标题" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="标题" /><textarea aria-label="Prompt 内容" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Prompt" /><input aria-label="Prompt 分类" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="分类" /><div><button type="submit" aria-label="保存 Prompt">保存</button><IconButton label="取消编辑 Prompt" onClick={() => setEditingId(null)}><X size={13} /></IconButton></div></form>}
    <div className="prompt-list">{prompts.map((prompt) => <article className="prompt-row" key={prompt.id}><span className="prompt-icon"><Library size={14} /></span><span className="prompt-copy"><span className="prompt-title">{prompt.title}</span><span className="prompt-category">{prompt.category}</span></span>{confirmDeleteId === prompt.id ? <div className="resource-confirm resource-confirm--compact" role="alert"><span>确认删除？</span><button type="button" className="danger-action" onClick={() => void deletePrompt(prompt.id).then(() => setConfirmDeleteId(null))}>删除</button><button type="button" onClick={() => setConfirmDeleteId(null)}>取消</button></div> : <><IconButton label={`复制内容 ${prompt.title}`} onClick={() => void navigator.clipboard.writeText(prompt.content)}><Copy size={13} /></IconButton><IconButton label={`编辑 ${prompt.title}`} onClick={() => edit(prompt)}><Pencil size={13} /></IconButton><IconButton label={`复制版本 ${prompt.title}`} onClick={() => void duplicatePrompt(prompt.id)}><Plus size={13} /></IconButton><IconButton label={`删除 ${prompt.title}`} onClick={() => setConfirmDeleteId(prompt.id)}><Trash2 size={13} /></IconButton></>}</article>)}</div>
  </section>
}

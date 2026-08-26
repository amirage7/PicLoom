import { Archive, Copy, Folder, MoreHorizontal, Plus, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'

export function ProjectList() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const workspaceMode = useAppStore((state) => state.workspaceMode)
  const unarchivedCount = useAppStore((state) => state.unarchivedCount)
  const selectProject = useAppStore((state) => state.selectProject)
  const selectQuickCreation = useAppStore((state) => state.selectQuickCreation)
  const createProject = useAppStore((state) => state.createProject)
  const renameProject = useAppStore((state) => state.renameProject)
  const deleteProject = useAppStore((state) => state.deleteProject)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const createTriggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!menuId) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuId(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [menuId])

  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    void createProject(name.trim()).then(() => { setName(''); setCreating(false) })
  }

  return (
    <div className="workspace-navigation-content">
      <button ref={createTriggerRef} className="sidebar-new-project" type="button" onClick={() => setCreating(true)}><Plus size={15} />新建项目</button>
      {creating && <form className="sidebar-inline-form" onSubmit={submitCreate}><input autoFocus aria-label="项目名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称" /><div className="form-actions"><button className="primary-button" type="submit" aria-label="创建项目">创建</button><IconButton label="取消新建项目" onClick={() => { setCreating(false); createTriggerRef.current?.focus() }}><X size={13} /></IconButton></div></form>}

      <button type="button" className={`quick-creation-row ${workspaceMode === 'quick' ? 'quick-creation-row--active' : ''}`} onClick={selectQuickCreation}>
        <span className="quick-creation-icon"><Zap size={15} /></span>
        <span><strong>快速创作</strong><small>未归档图片</small></span>
        <b>{unarchivedCount}</b>
      </button>

      <section className="sidebar-section sidebar-projects" aria-labelledby="projects-heading">
        <div className="section-heading-row"><h2 id="projects-heading">项目</h2></div>
        {projects.length === 0 && !creating && <div className="sidebar-empty"><strong>还没有项目</strong><span>临时图片可以留在快速创作，也可以建立正式项目。</span><button type="button" onClick={() => setCreating(true)}>创建第一个项目</button></div>}
        <div className="project-list">
          {projects.map((project) => {
            const active = workspaceMode === 'project' && activeProjectId === project.id
            return <div className="project-item" key={project.id}>
              {renamingId === project.id ? <form className="sidebar-inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void renameProject(project.id, name.trim()).then(() => setRenamingId(null)) }}><input autoFocus value={name} aria-label="重命名项目" onChange={(event) => setName(event.target.value)} /><button type="submit">保存</button></form> :
                <button type="button" aria-label={`${project.name} ${project.imageCount}`} aria-current={active ? 'page' : undefined} className={`project-row ${active ? 'project-row--active' : ''}`} onClick={() => selectProject(project.id)}><span className="project-icon"><Folder size={15} /></span><span className="project-name"><strong>{project.name}</strong><small>{project.imageCount} 张图片</small></span></button>}
              <IconButton className="project-menu-button" label={`管理 ${project.name}`} onClick={() => setMenuId(menuId === project.id ? null : project.id)}><MoreHorizontal size={14} /></IconButton>
              {menuId === project.id && <div className="resource-menu">{confirmDeleteId === project.id ? <div className="resource-confirm" role="alert"><span>删除“{project.name}”？</span><button className="danger-action" type="button" aria-label="确认删除" onClick={() => void deleteProject(project.id).then(() => { setMenuId(null); setConfirmDeleteId(null) })}>确认</button><button type="button" onClick={() => setConfirmDeleteId(null)}>取消</button></div> : <>
                <button type="button" onClick={() => { setName(project.name); setRenamingId(project.id); setMenuId(null) }}>重命名</button>
                <button type="button" onClick={() => void createProject(`${project.name} 副本`).then(() => setMenuId(null))}><Copy size={12} />复制项目</button>
                <button type="button" disabled title="归档数据将在后续版本开放"><Archive size={12} />归档</button>
                <button type="button" onClick={() => setConfirmDeleteId(project.id)}><Trash2 size={12} />删除</button>
              </>}</div>}
            </div>
          })}
        </div>
      </section>
    </div>
  )
}

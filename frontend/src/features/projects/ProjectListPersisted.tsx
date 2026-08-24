import { Box, Building2, MoreHorizontal, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'


const projectIcons = [Sparkles, Box, Building2]

export function ProjectList() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const selectProject = useAppStore((state) => state.selectProject)
  const createProject = useAppStore((state) => state.createProject)
  const renameProject = useAppStore((state) => state.renameProject)
  const deleteProject = useAppStore((state) => state.deleteProject)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const submitCreate = (event: FormEvent) => {
    event.preventDefault()
    const value = name.trim()
    if (!value) return
    void createProject(value).then(() => { setName(''); setCreating(false) })
  }

  return (
    <section className="sidebar-section" aria-labelledby="projects-heading">
      <div className="section-heading-row"><h2 id="projects-heading">项目</h2><IconButton label="新建项目" onClick={() => setCreating(true)}><Plus size={15} /></IconButton></div>
      {creating && <form className="sidebar-inline-form" onSubmit={submitCreate}><input autoFocus aria-label="项目名称" value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称" /><button type="submit" aria-label="创建项目">创建</button><IconButton label="取消新建项目" onClick={() => setCreating(false)}><X size={13} /></IconButton></form>}
      <div className="project-list">
        {projects.map((project, index) => {
          const ProjectIcon = projectIcons[index] ?? Box
          const isActive = activeProjectId === project.id
          return <div className="project-item" key={project.id}>
            {renamingId === project.id ? (
              <form className="sidebar-inline-form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void renameProject(project.id, name.trim()).then(() => setRenamingId(null)) }}><input autoFocus aria-label="重命名项目" value={name} onChange={(event) => setName(event.target.value)} /><button type="submit">保存</button></form>
            ) : <button type="button" aria-current={isActive ? 'page' : undefined} className={`project-row ${isActive ? 'project-row--active' : ''}`} onClick={() => selectProject(project.id)}><span className="project-icon"><ProjectIcon size={15} /></span><span className="project-name">{project.name}</span><span className="project-count">{project.imageCount}</span></button>}
            <IconButton className="project-menu-button" label={`管理 ${project.name}`} onClick={() => setMenuId(menuId === project.id ? null : project.id)}><MoreHorizontal size={14} /></IconButton>
            {menuId === project.id && <div className="resource-menu">{confirmDeleteId === project.id ? <div className="resource-confirm" role="alert"><span>删除“{project.name}”？</span><button type="button" className="danger-action" onClick={() => void deleteProject(project.id).then(() => { setConfirmDeleteId(null); setMenuId(null) })}>确认删除</button><button type="button" onClick={() => setConfirmDeleteId(null)}>取消</button></div> : <><button type="button" onClick={() => { setName(project.name); setRenamingId(project.id); setMenuId(null) }}>重命名</button><button type="button" disabled={projects.length === 1} onClick={() => setConfirmDeleteId(project.id)}><Trash2 size={12} />删除</button></>}</div>}
          </div>
        })}
      </div>
    </section>
  )
}

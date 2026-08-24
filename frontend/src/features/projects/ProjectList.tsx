import { Box, Building2, MoreHorizontal, Plus, Sparkles } from 'lucide-react'

import { IconButton } from '../../components/IconButton'
import { useAppStore } from '../../app/store'


const projectIcons = [Sparkles, Box, Building2]

export function ProjectList() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const selectProject = useAppStore((state) => state.selectProject)

  return (
    <section className="sidebar-section" aria-labelledby="projects-heading">
      <div className="section-heading-row">
        <h2 id="projects-heading">项目</h2>
        <IconButton label="新建项目将在 Phase 3 开放" disabled>
          <Plus size={15} />
        </IconButton>
      </div>

      <div className="project-list">
        {projects.map((project, index) => {
          const ProjectIcon = projectIcons[index] ?? Box
          const isActive = activeProjectId === project.id

          return (
            <button
              key={project.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              className={`project-row ${isActive ? 'project-row--active' : ''}`}
              onClick={() => selectProject(project.id)}
            >
              <span className="project-icon"><ProjectIcon size={15} /></span>
              <span className="project-name">{project.name}</span>
              <span className="project-count">{project.imageCount}</span>
              <MoreHorizontal className="project-more" size={14} aria-hidden="true" />
            </button>
          )
        })}
      </div>
    </section>
  )
}

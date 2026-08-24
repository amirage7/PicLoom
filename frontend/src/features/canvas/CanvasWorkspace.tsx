import {
  ChevronDown,
  CircleHelp,
  Hand,
  ImagePlus,
  Link2,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Search,
  Upload,
} from 'lucide-react'

import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'
import type { BackendStatus } from '../../lib/useBackendHealth'

interface CanvasWorkspaceProps {
  backendStatus: BackendStatus
}

const statusText: Record<BackendStatus, string> = {
  checking: '正在连接',
  online: '本地服务在线',
  offline: '后端离线',
}

export function CanvasWorkspace({ backendStatus }: CanvasWorkspaceProps) {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const toggleLeftPanel = useAppStore((state) => state.toggleLeftPanel)
  const toggleRightPanel = useAppStore((state) => state.toggleRightPanel)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]

  return (
    <main className="canvas-workspace">
      <header className="canvas-header">
        <div className="canvas-title-group">
          <IconButton label="切换左侧栏" onClick={toggleLeftPanel}><PanelLeftClose size={16} /></IconButton>
          <span className="breadcrumb">项目</span>
          <span className="breadcrumb-separator">/</span>
          <h1>{activeProject.name}</h1>
          <ChevronDown size={14} aria-hidden="true" />
        </div>

        <div className="canvas-actions">
          <div className={`backend-status backend-status--${backendStatus}`} role="status">
            <span className="status-mark" />
            {statusText[backendStatus]}
          </div>
          <IconButton label="搜索将在后续阶段开放" disabled><Search size={16} /></IconButton>
          <IconButton label="帮助"><CircleHelp size={16} /></IconButton>
          <IconButton label="切换详情栏" onClick={toggleRightPanel}><PanelRightClose size={16} /></IconButton>
        </div>
      </header>

      <div className="canvas-surface">
        <div className="canvas-toolbar" aria-label="画布工具栏">
          <IconButton label="选择工具" isActive><MousePointer2 size={16} /></IconButton>
          <IconButton label="抓手工具将在 Phase 2 开放" disabled><Hand size={16} /></IconButton>
          <span className="toolbar-divider" />
          <IconButton label="添加图片将在 Phase 2 开放" disabled><ImagePlus size={16} /></IconButton>
          <IconButton label="连接图片将在 Phase 2 开放" disabled><Link2 size={16} /></IconButton>
        </div>

        <div className="canvas-empty-state">
          <div className="empty-state-icon"><Upload size={24} strokeWidth={1.6} /></div>
          <h2>从第一张图片开始</h2>
          <p>Phase 2 将在这里启用无限画布。你可以拖入图片、排列版本并连接创作关系。</p>
          <button className="primary-action" type="button" disabled>
            <ImagePlus size={15} />
            添加图片
            <span className="phase-badge">Phase 2</span>
          </button>
          <span className="drop-hint">支持 PNG、JPG 与 WEBP</span>
        </div>

        <div className="zoom-controls" aria-label="缩放控制">
          <IconButton label="缩小将在 Phase 2 开放" disabled><Minus size={15} /></IconButton>
          <button type="button" disabled className="zoom-value">100%</button>
          <IconButton label="放大将在 Phase 2 开放" disabled><Plus size={15} /></IconButton>
        </div>
      </div>
    </main>
  )
}

import { useEffect } from 'react'
import { Aperture, Settings2, X } from 'lucide-react'

import { IconButton } from '../components/IconButton'
import { CanvasBoard } from '../features/canvas/CanvasBoard'
import { releaseAllObjectUrls } from '../features/canvas/store/canvasStore'
import { RightPanel } from '../components/panels/RightPanel'
import { ProjectList } from '../features/projects/ProjectListPersisted'
import { PromptLibrary } from '../features/prompts/PromptLibraryPersisted'
import { useBackendHealth } from '../lib/useBackendHealth'
import { useAppStore } from './store'
import { useResponsivePanels } from './useResponsivePanels'


export default function App() {
  const panels = useResponsivePanels()
  const hydrateResources = useAppStore((state) => state.hydrateResources)
  useEffect(() => {
    const releaseUploads = () => releaseAllObjectUrls()
    window.addEventListener('pagehide', releaseUploads)
    return () => window.removeEventListener('pagehide', releaseUploads)
  }, [])

  const backendStatus = useBackendHealth()
  useEffect(() => {
    if (backendStatus === 'online') void hydrateResources().catch(() => undefined)
  }, [backendStatus, hydrateResources])


  return (
    <div
      className="app-shell"
      data-left-open={panels.isLeftOpen}
      data-right-open={panels.isRightOpen}
      data-compact={panels.isCompact}
    >
      {panels.isLeftOpen && (
        <nav id="workspace-navigation" className="left-sidebar" aria-label="工作区导航">
          <header className="brand-header">
            <div className="brand-mark"><Aperture size={18} strokeWidth={1.8} /></div>
            <div className="brand-type">
              <strong>AI Image Canvas</strong>
              <span>Local workspace</span>
            </div>
            <IconButton label="设置将在后续阶段开放" disabled><Settings2 size={15} /></IconButton>
            <IconButton className="compact-panel-close" label="关闭导航" onClick={() => panels.closePanels()}><X size={15} /></IconButton>
          </header>
          <ProjectList />
          <PromptLibrary />
          <footer className="sidebar-footer">
            <span className="local-dot" />
            本地工作区
            <span>0.1</span>
          </footer>
        </nav>
      )}

      <CanvasBoard
        backendStatus={backendStatus}
        isLeftPanelOpen={panels.isLeftOpen}
        isRightPanelOpen={panels.isRightOpen}
        onToggleLeft={(trigger) => panels.toggleLeft(trigger)}
        onToggleRight={(trigger) => panels.toggleRight(trigger)}
        shortcutsEnabled={!panels.isCompact || (!panels.isLeftOpen && !panels.isRightOpen)}
      />

      {panels.isCompact && (panels.isLeftOpen || panels.isRightOpen) && <button type="button" className="panel-backdrop" aria-label="关闭侧栏" onClick={() => panels.closePanels()} />}
      {panels.isRightOpen && <RightPanel id="image-inspector" onClose={() => panels.closePanels()} />}
    </div>
  )
}

import { useEffect } from 'react'
import { Aperture, Settings2 } from 'lucide-react'

import { IconButton } from '../components/IconButton'
import { CanvasBoard } from '../features/canvas/CanvasBoard'
import { releaseAllObjectUrls } from '../features/canvas/store/canvasStore'
import { ImageInspector } from '../features/inspector/ImageInspector'
import { ProjectList } from '../features/projects/ProjectList'
import { PromptLibrary } from '../features/prompts/PromptLibrary'
import { useBackendHealth } from '../lib/useBackendHealth'
import { useAppStore } from './store'


export default function App() {
  const isLeftPanelOpen = useAppStore((state) => state.isLeftPanelOpen)
  useEffect(() => {
    const releaseUploads = () => releaseAllObjectUrls()
    window.addEventListener('pagehide', releaseUploads)
    return () => window.removeEventListener('pagehide', releaseUploads)
  }, [])

  const isRightPanelOpen = useAppStore((state) => state.isRightPanelOpen)
  const backendStatus = useBackendHealth()

  return (
    <div
      className="app-shell"
      data-left-open={isLeftPanelOpen}
      data-right-open={isRightPanelOpen}
    >
      {isLeftPanelOpen && (
        <nav className="left-sidebar" aria-label="工作区导航">
          <header className="brand-header">
            <div className="brand-mark"><Aperture size={18} strokeWidth={1.8} /></div>
            <div className="brand-type">
              <strong>AI Image Canvas</strong>
              <span>Local workspace</span>
            </div>
            <IconButton label="设置将在后续阶段开放" disabled><Settings2 size={15} /></IconButton>
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

      <CanvasBoard backendStatus={backendStatus} />

      {isRightPanelOpen && <ImageInspector />}
    </div>
  )
}

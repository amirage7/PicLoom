import { X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { IconButton } from '../IconButton'
import { useAppStore } from '../../app/store'
import { getDesktopBridge } from '../../features/desktop/desktopBridge'
import { ChatGptGenerationPanel } from '../../features/generation/ChatGptGenerationPanel'
import { useGenerationStore } from '../../features/generation/generationStore'
import { ImageInspector } from '../../features/inspector/ImageInspector'

interface RightPanelProps {
  id?: string
  onClose?: () => void
}

export function RightPanel({ id, onClose }: RightPanelProps) {
  const desktopMode = getDesktopBridge() !== null
  const projectId = useAppStore((state) => state.activeProjectId)
  const workspaceMode = useAppStore((state) => state.workspaceMode)
  const selectedGalleryImage = useAppStore((state) => state.selectedGalleryImage)
  const generationPanelOpen = useGenerationStore((state) => state.isPanelOpen)
  const setGenerationPanelOpen = useGenerationStore((state) => state.setPanelOpen)
  const [activeTab, setActiveTab] = useState<'details' | 'chatgpt'>('details')

  useEffect(() => {
    if (desktopMode && generationPanelOpen) setActiveTab('chatgpt')
  }, [desktopMode, generationPanelOpen])

  useEffect(() => {
    if (selectedGalleryImage) setActiveTab('details')
  }, [selectedGalleryImage])

  if (!desktopMode) return <ImageInspector id={id} onClose={onClose} />

  const selectTab = (tab: 'details' | 'chatgpt') => {
    setActiveTab(tab)
    setGenerationPanelOpen(tab === 'chatgpt')
  }

  return (
    <div className="right-panel-shell">
      <header className="right-panel-header">
        <div className="right-panel-tabs" role="tablist" aria-label="右侧面板">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'details'}
            onClick={() => selectTab('details')}
          >图片详情</button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'chatgpt'}
            onClick={() => selectTab('chatgpt')}
          >ChatGPT</button>
        </div>
        {onClose && <IconButton label="关闭图片详情" onClick={onClose}><X size={15} /></IconButton>}
      </header>

      {activeTab === 'details' ? (
        <ImageInspector id={id} />
      ) : (
        <aside id={id} className="inspector-panel desktop-chat-panel" aria-label="ChatGPT 生图">
          <ChatGptGenerationPanel projectId={workspaceMode === 'quick' ? null : projectId} />
        </aside>
      )}
    </div>
  )
}

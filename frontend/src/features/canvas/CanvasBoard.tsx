import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
  type NodeTypes,
} from '@xyflow/react'
import {
  ChevronDown,
  CircleHelp,
  Focus,
  Hand,
  ImagePlus,
  Link2,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Search,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, type ChangeEvent, type DragEvent } from 'react'

import { SaveStatus } from '../../components/SaveStatus'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'
import type { BackendStatus } from '../../lib/useBackendHealth'
import { GenerationPanel } from '../generation/GenerationPanel'
import { useGenerationStore } from '../generation/generationStore'
import { ImageNode } from './components/ImageNode'
import { useCanvasStore } from './store/canvasStore'
import { useCanvasShortcuts } from './useCanvasShortcuts'

interface CanvasBoardProps {
  backendStatus: BackendStatus
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean
  onToggleLeft: (trigger: HTMLButtonElement) => void
  onToggleRight: (trigger: HTMLButtonElement) => void
  shortcutsEnabled: boolean
}

const nodeTypes: NodeTypes = { image: ImageNode }
const statusText: Record<BackendStatus, string> = {
  checking: '正在连接', online: '本地服务在线', offline: '后端离线',
}

function Board({
  projectId,
  shortcutsEnabled,
  isRightPanelOpen,
  onToggleRight,
}: {
  projectId: string
  shortcutsEnabled: boolean
  isRightPanelOpen: boolean
  onToggleRight: (trigger: HTMLButtonElement) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const canvas = useCanvasStore((state) => state.canvases[projectId]) ?? { nodes: [], edges: [], selectedNodeId: null }
  const activeTool = useCanvasStore((state) => state.activeTool)
  const error = useCanvasStore((state) => state.error)
  const setTool = useCanvasStore((state) => state.setTool)
  const clearError = useCanvasStore((state) => state.clearError)
  const applyNodeChanges = useCanvasStore((state) => state.applyNodeChanges)
  const applyEdgeChanges = useCanvasStore((state) => state.applyEdgeChanges)
  const selectNode = useCanvasStore((state) => state.selectNode)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const loadCanvas = useCanvasStore((state) => state.loadCanvas)
  const uploadPersistedImages = useCanvasStore((state) => state.uploadPersistedImages)
  const persistPosition = useCanvasStore((state) => state.persistPosition)
  const persistConnection = useCanvasStore((state) => state.persistConnection)
  const deletePersistedNode = useCanvasStore((state) => state.deletePersistedNode)
  const isGenerationPanelOpen = useGenerationStore((state) => state.isPanelOpen)
  const setGenerationPanelOpen = useGenerationStore((state) => state.setPanelOpen)
  const desktopMode = getDesktopBridge() !== null
  const { fitView, screenToFlowPosition, zoomIn, zoomOut, zoomTo } = useReactFlow()
  const { zoom } = useViewport()
  useCanvasShortcuts({
    select: () => setTool('select'),
    pan: () => setTool('pan'),
    fit: () => void fitView({ padding: 0.22 }),
    clear: () => selectNode(projectId, null),
    enabled: shortcutsEnabled,
  })

  useEffect(() => {
    if (useAppStore.getState().saveStatus !== 'offline') void loadCanvas(projectId).catch(() => undefined)
  }, [loadCanvas, projectId])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, textarea, [contenteditable="true"]')) return
      if ((event.key === 'Delete' || event.key === 'Backspace') && canvas.selectedNodeId) {
        event.preventDefault()
        const selectedNode = canvas.nodes.find((node) => node.id === canvas.selectedNodeId)
        if (selectedNode?.data.image.imageSource === 'stored') {
          void deletePersistedNode(projectId, canvas.selectedNodeId).catch(() => undefined)
        } else {
          deleteNode(projectId, canvas.selectedNodeId)
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canvas.nodes, canvas.selectedNodeId, deleteNode, deletePersistedNode, projectId])

  const addFiles = async (files: FileList | null, clientX?: number, clientY?: number) => {
    if (!files?.length) return
    const position = clientX === undefined
      ? screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : screenToFlowPosition({ x: clientX, y: clientY ?? 0 })
    const ids = await uploadPersistedImages(projectId, Array.from(files), position)
    if (ids[0]) selectNode(projectId, ids[0])
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    void addFiles(event.dataTransfer.files, event.clientX, event.clientY)
  }

  const onInput = (event: ChangeEvent<HTMLInputElement>) => {
    void addFiles(event.target.files)
    event.target.value = ''
  }

  return (
    <div
      className="canvas-surface"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={canvas.nodes}
        edges={canvas.edges}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => applyNodeChanges(projectId, changes)}
        onEdgesChange={(changes) => applyEdgeChanges(projectId, changes)}
        onConnect={(connection) => {
          if (connection.source && connection.target) void persistConnection(projectId, connection.source, connection.target)
        }}
        onNodeDragStop={(_, node) => void persistPosition(projectId, node.id, node.position)}
        onNodeClick={(_, node) => selectNode(projectId, node.id)}
        onPaneClick={() => selectNode(projectId, null)}
        nodesDraggable={activeTool === 'select'}
        elementsSelectable={activeTool === 'select'}
        panOnDrag={activeTool === 'pan' ? true : [1]}
        selectionOnDrag={activeTool === 'select'}
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.22 }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#45504e" />
      </ReactFlow>

      <div className="canvas-toolbar" aria-label="画布工具栏">
        <IconButton label="选择工具 (V)" isActive={activeTool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={16} /></IconButton>
        <IconButton label="抓手工具 (H)" isActive={activeTool === 'pan'} onClick={() => setTool('pan')}><Hand size={16} /></IconButton>
        <span className="toolbar-divider" />
        <IconButton label="添加图片" onClick={() => inputRef.current?.click()}><ImagePlus size={16} /></IconButton>
        <IconButton label="使用 ChatGPT 生成图片" isActive={isGenerationPanelOpen} onClick={(event) => {
          const nextOpen = !isGenerationPanelOpen
          setGenerationPanelOpen(nextOpen)
          if (desktopMode && nextOpen && !isRightPanelOpen) onToggleRight(event.currentTarget)
        }}>
          <Sparkles size={16} />
        </IconButton>
        <IconButton label="连接图片：拖动节点两侧圆点" onClick={() => setTool('select')}><Link2 size={16} /></IconButton>
        <input ref={inputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={onInput} />
      </div>

      {!desktopMode && isGenerationPanelOpen && <GenerationPanel projectId={projectId} onCompleted={(imageId) => void loadCanvas(projectId).then(() => selectNode(projectId, imageId))} />}

      {canvas.nodes.length === 0 && (
        <button className="canvas-empty-state canvas-drop-target" type="button" onClick={() => inputRef.current?.click()}>
          <span className="empty-state-icon"><Upload size={24} strokeWidth={1.6} /></span>
          <strong>把图片放到画布上</strong>
          <span>拖入或点击选择 PNG、JPG、WEBP，单张不超过 20 MB</span>
        </button>
      )}

      {error && (
        <div className="canvas-error" role="alert">
          <span>{error}</span>
          <IconButton label="关闭提示" onClick={clearError}><X size={14} /></IconButton>
        </div>
      )}

      <div className="zoom-controls" aria-label="缩放控制">
        <IconButton label="缩小" onClick={() => void zoomOut()}><Minus size={15} /></IconButton>
        <button type="button" className="zoom-value" onClick={() => void zoomTo(1)}>{Math.round(zoom * 100)}%</button>
        <IconButton label="放大" onClick={() => void zoomIn()}><Plus size={15} /></IconButton>
        <IconButton label="适应全部内容" onClick={() => void fitView({ padding: 0.22 })}><Focus size={15} /></IconButton>
      </div>
    </div>
  )
}

export function CanvasBoard({ backendStatus, isLeftPanelOpen, isRightPanelOpen, onToggleLeft, onToggleRight, shortcutsEnabled }: CanvasBoardProps) {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const hydrateResources = useAppStore((state) => state.hydrateResources)
  const loadCanvas = useCanvasStore((state) => state.loadCanvas)

  return (
    <main className="canvas-workspace">
      <header className="canvas-header">
        <div className="canvas-title-group">
          <IconButton label="切换左侧栏" aria-controls="workspace-navigation" aria-expanded={isLeftPanelOpen} onClick={(event) => onToggleLeft(event.currentTarget)}><PanelLeftClose size={16} /></IconButton>
          <span className="breadcrumb">项目</span><span className="breadcrumb-separator">/</span>
          <h1>{activeProject.name}</h1><ChevronDown size={14} aria-hidden="true" />
        </div>
        <div className="canvas-actions">
          <div className={`backend-status backend-status--${backendStatus}`} role="status"><span className="status-mark" />{statusText[backendStatus]}</div>
          <SaveStatus onRetry={() => void hydrateResources().then(() => loadCanvas(activeProject.id)).catch(() => undefined)} />
          <IconButton label="搜索将在后续阶段开放" disabled><Search size={16} /></IconButton>
          <IconButton label="帮助：拖动空白区域平移，滚轮缩放"><CircleHelp size={16} /></IconButton>
          <IconButton label="切换详情栏" aria-controls="image-inspector" aria-expanded={isRightPanelOpen} onClick={(event) => onToggleRight(event.currentTarget)}><PanelRightClose size={16} /></IconButton>
        </div>
      </header>
      <ReactFlowProvider key={activeProjectId}>
        <Board
          projectId={activeProjectId}
          shortcutsEnabled={shortcutsEnabled}
          isRightPanelOpen={isRightPanelOpen}
          onToggleRight={onToggleRight}
        />
      </ReactFlowProvider>
    </main>
  )
}

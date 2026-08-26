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
import { GalleryView } from '../gallery/GalleryView'
import { useGenerationStore } from '../generation/generationStore'
import { ImageNode } from './components/ImageNode'
import { useCanvasStore } from './store/canvasStore'
import { useCanvasShortcuts } from './useCanvasShortcuts'
import { useCanvasDeletionShortcut } from './useCanvasDeletionShortcut'

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

export function Board({
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
  const selectEdge = useCanvasStore((state) => state.selectEdge)
  const selectImportedBatch = useCanvasStore((state) => state.selectImportedBatch)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const loadCanvas = useCanvasStore((state) => state.loadCanvas)
  const uploadPersistedImages = useCanvasStore((state) => state.uploadPersistedImages)
  const persistPosition = useCanvasStore((state) => state.persistPosition)
  const persistConnection = useCanvasStore((state) => state.persistConnection)
  const persistEdgeDeletion = useCanvasStore((state) => state.persistEdgeDeletion)
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
    const bridge = getDesktopBridge()
    if (!bridge) return
    return bridge.onGenerationEvent((generationEvent) => {
      if (generationEvent.state !== 'completed' || generationEvent.imageIds.length === 0) return
      void loadCanvas(projectId).then(() => {
        const canvasState = useCanvasStore.getState().canvases[projectId]
        const importedNodes = canvasState?.nodes.filter((node) => generationEvent.imageIds.includes(node.id)) ?? []
        if (importedNodes.length === 0) return
        selectImportedBatch(projectId, generationEvent.imageIds)
        requestAnimationFrame(() => {
          const refreshed = useCanvasStore.getState().canvases[projectId]?.nodes
            .filter((node) => generationEvent.imageIds.includes(node.id)) ?? []
          if (refreshed.length > 0) void fitView({ nodes: refreshed, padding: 0.25, duration: 250 })
        })
      }).catch(() => undefined)
    })
  }, [fitView, loadCanvas, projectId, selectImportedBatch])

  useCanvasDeletionShortcut({
    enabled: shortcutsEnabled,
    onDelete: () => {
      const selectedEdge = canvas.edges.find((edge) => edge.selected)
      if (selectedEdge) {
        void persistEdgeDeletion(projectId, selectedEdge.source, selectedEdge.target).catch(() => undefined)
        return
      }
      if (!canvas.selectedNodeId) return
      const selectedNode = canvas.nodes.find((node) => node.id === canvas.selectedNodeId)
      if (selectedNode?.data.image.imageSource === 'stored') {
        void deletePersistedNode(projectId, canvas.selectedNodeId).catch(() => undefined)
      } else {
        deleteNode(projectId, canvas.selectedNodeId)
      }
    },
  })

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
        onEdgeClick={(_, edge) => selectEdge(projectId, edge.id)}
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
        <IconButton label="连接图片：拖动节点圆点；选中连线后按 Delete 删除" onClick={() => setTool('select')}><Link2 size={16} /></IconButton>
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
  const workspaceMode = useAppStore((state) => state.workspaceMode)
  const projectView = useAppStore((state) => state.projectView)
  const setProjectView = useAppStore((state) => state.setProjectView)
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0]
  const hydrateResources = useAppStore((state) => state.hydrateResources)
  const loadCanvas = useCanvasStore((state) => state.loadCanvas)

  return (
    <main className="canvas-workspace">
      <header className="canvas-header">
        <div className="canvas-title-group">
          <IconButton label="切换左侧栏" aria-controls="workspace-navigation" aria-expanded={isLeftPanelOpen} onClick={(event) => onToggleLeft(event.currentTarget)}><PanelLeftClose size={16} /></IconButton>
          <span className="breadcrumb">{workspaceMode === 'quick' ? '工作区' : '项目'}</span><span className="breadcrumb-separator">/</span>
          <h1>{workspaceMode === 'quick' ? '快速创作' : activeProject.name}</h1>{workspaceMode === 'project' && <ChevronDown size={14} aria-hidden="true" />}
          {workspaceMode === 'project' && <div className="workspace-view-tabs" role="tablist" aria-label="项目视图"><button type="button" role="tab" aria-selected={projectView === 'canvas'} onClick={() => setProjectView('canvas')}>画布</button><button type="button" role="tab" aria-selected={projectView === 'gallery'} onClick={() => setProjectView('gallery')}>图库</button></div>}
        </div>
        <div className="canvas-actions">
          <div className={`backend-status backend-status--${backendStatus}`} role="status"><span className="status-mark" />{statusText[backendStatus]}</div>
          <SaveStatus onRetry={() => void hydrateResources().then(() => workspaceMode === 'project' ? loadCanvas(activeProject.id) : undefined).catch(() => undefined)} />
          <IconButton label="搜索将在后续阶段开放" disabled><Search size={16} /></IconButton>
          <IconButton label="帮助：拖动空白区域平移，滚轮缩放"><CircleHelp size={16} /></IconButton>
          <IconButton label="切换详情栏" aria-controls="image-inspector" aria-expanded={isRightPanelOpen} onClick={(event) => onToggleRight(event.currentTarget)}><PanelRightClose size={16} /></IconButton>
        </div>
      </header>
      {workspaceMode === 'quick' ? <GalleryView projectId={null} /> : projectView === 'gallery' ? <GalleryView projectId={activeProjectId} /> : <ReactFlowProvider key={activeProjectId}>
        <Board projectId={activeProjectId} shortcutsEnabled={shortcutsEnabled} isRightPanelOpen={isRightPanelOpen} onToggleRight={onToggleRight} />
      </ReactFlowProvider>}
    </main>
  )
}

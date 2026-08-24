import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { create } from 'zustand'

import type { CanvasNode, CanvasTool, ProjectCanvasState } from '../../../types/domain'
import { validateImageFiles } from '../model/files'
import { createInitialCanvases } from './fixtures'


const objectUrlReferences = new Map<string, number>()

function retainObjectUrl(url: string) {
  objectUrlReferences.set(url, (objectUrlReferences.get(url) ?? 0) + 1)
}

function releaseObjectUrl(url: string) {
  const nextCount = (objectUrlReferences.get(url) ?? 0) - 1
  if (nextCount > 0) {
    objectUrlReferences.set(url, nextCount)
    return
  }
  objectUrlReferences.delete(url)
  URL.revokeObjectURL(url)
}

export function releaseAllObjectUrls() {
  for (const url of objectUrlReferences.keys()) URL.revokeObjectURL(url)
  objectUrlReferences.clear()
}

export function resetObjectUrlRegistry() {
  objectUrlReferences.clear()
}

function syncParentIds(canvas: ProjectCanvasState): ProjectCanvasState {
  const parentsByTarget = new Map(canvas.edges.map((edge) => [edge.target, edge.source]))
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        image: {
          ...node.data.image,
          parentId: parentsByTarget.get(node.id) ?? null,
        },
      },
    })),
  }
}

function updateCanvas(
  canvases: Record<string, ProjectCanvasState>,
  projectId: string,
  update: (canvas: ProjectCanvasState) => ProjectCanvasState,
) {
  const canvas = canvases[projectId] ?? { nodes: [], edges: [], selectedNodeId: null }
  return { ...canvases, [projectId]: update(canvas) }
}

interface CanvasStore {
  canvases: Record<string, ProjectCanvasState>
  activeTool: CanvasTool
  error: string | null
  setTool: (tool: CanvasTool) => void
  clearError: () => void
  applyNodeChanges: (projectId: string, changes: NodeChange<CanvasNode>[]) => void
  applyEdgeChanges: (projectId: string, changes: EdgeChange[]) => void
  selectNode: (projectId: string, nodeId: string | null) => void
  connectNodes: (projectId: string, connection: Connection) => void
  addUploadedImages: (projectId: string, files: readonly File[], position: XYPosition) => string[]
  duplicateNode: (projectId: string, nodeId: string) => string | null
  deleteNode: (projectId: string, nodeId: string) => void
  reset: () => void
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  canvases: createInitialCanvases(),
  activeTool: 'select',
  error: null,
  setTool: (activeTool) => set({ activeTool }),
  clearError: () => set({ error: null }),
  applyNodeChanges: (projectId, changes) => set((state) => ({
    canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
      ...canvas,
      nodes: applyNodeChanges(changes, canvas.nodes),
    })),
  })),
  applyEdgeChanges: (projectId, changes) => set((state) => ({
    canvases: updateCanvas(state.canvases, projectId, (canvas) => syncParentIds({
      ...canvas,
      edges: applyEdgeChanges(changes, canvas.edges),
    })),
  })),
  selectNode: (projectId, nodeId) => set((state) => ({
    canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
      ...canvas,
      selectedNodeId: nodeId,
      nodes: canvas.nodes.map((node) => ({ ...node, selected: node.id === nodeId })),
    })),
  })),
  connectNodes: (projectId, connection) => {
    const { source, target } = connection
    if (!source || !target || source === target) return

    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => {
        const sourceExists = canvas.nodes.some((node) => node.id === source)
        const targetExists = canvas.nodes.some((node) => node.id === target)
        if (!sourceExists || !targetExists) return canvas

        const withoutOldIncoming = canvas.edges.filter((edge) => edge.target !== target)
        const duplicate = withoutOldIncoming.some(
          (edge) => edge.source === source && edge.target === target,
        )
        if (duplicate) return canvas

        return syncParentIds({
          ...canvas,
          edges: [
            ...withoutOldIncoming,
            { id: `edge-${source}-${target}`, source, target, type: 'smoothstep' },
          ],
        })
      }),
    }))
  },
  addUploadedImages: (projectId, files, position) => {
    const validation = validateImageFiles(files)
    const createdNodes: CanvasNode[] = []

    for (const [index, file] of validation.valid.entries()) {
      try {
        const id = `image-${crypto.randomUUID()}`
        const imageUrl = URL.createObjectURL(file)
        retainObjectUrl(imageUrl)
        createdNodes.push({
          id,
          type: 'image',
          position: {
            x: position.x + (index % 2) * 270,
            y: position.y + Math.floor(index / 2) * 230,
          },
          data: {
            image: {
              id,
              projectId,
              imageUrl,
              imageSource: 'upload',
              fileName: file.name,
              prompt: '尚未添加 Prompt',
              tags: [],
              parentId: null,
              createdTime: new Date().toISOString(),
            },
          },
        })
      } catch {
        validation.errors.push(`${file.name}：无法读取图片`)
      }
    }

    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
        ...canvas,
        nodes: [...canvas.nodes, ...createdNodes],
      })),
      error: validation.errors[0] ?? null,
    }))

    return createdNodes.map((node) => node.id)
  },
  duplicateNode: (projectId, nodeId) => {
    const source = get().canvases[projectId]?.nodes.find((node) => node.id === nodeId)
    if (!source) return null

    const id = `image-${crypto.randomUUID()}`
    if (source.data.image.imageSource === 'upload') retainObjectUrl(source.data.image.imageUrl)
    const duplicate: CanvasNode = {
      ...source,
      id,
      selected: true,
      position: { x: source.position.x + 60, y: source.position.y + 60 },
      data: {
        image: {
          ...source.data.image,
          id,
          parentId: null,
          createdTime: new Date().toISOString(),
        },
      },
    }

    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
        ...canvas,
        selectedNodeId: id,
        nodes: [...canvas.nodes.map((node) => ({ ...node, selected: false })), duplicate],
      })),
      error: null,
    }))
    return id
  },
  deleteNode: (projectId, nodeId) => {
    const node = get().canvases[projectId]?.nodes.find((item) => item.id === nodeId)
    if (!node) return
    if (node.data.image.imageSource === 'upload') releaseObjectUrl(node.data.image.imageUrl)

    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => syncParentIds({
        ...canvas,
        selectedNodeId: canvas.selectedNodeId === nodeId ? null : canvas.selectedNodeId,
        nodes: canvas.nodes.filter((item) => item.id !== nodeId),
        edges: canvas.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      })),
      error: null,
    }))
  },
  reset: () => set({ canvases: createInitialCanvases(), activeTool: 'select', error: null }),
}))

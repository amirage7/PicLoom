import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react'
import { create } from 'zustand'

import type { CanvasImage, CanvasNode, CanvasTool, ProjectCanvasState } from '../../../types/domain'
import { useAppStore } from '../../../app/store'
import * as resourcesApi from '../../../lib/resourcesApi'
import type { ImageDto, ImagePatch } from '../../../lib/resourcesApi'
import { validateImageFiles } from '../model/files'
import { createInitialCanvases } from './fixtures'


const objectUrlReferences = new Map<string, number>()
const projectLoadVersions = new Map<string, number>()
const edgeDeletionRequests = new Map<string, Promise<void>>()
let nextProjectLoadVersion = 0

function bumpProjectLoadVersion(projectId: string) {
  const version = ++nextProjectLoadVersion
  projectLoadVersions.set(projectId, version)
  return version
}

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

function syncSourceIds(canvas: ProjectCanvasState): ProjectCanvasState {
  const sourcesByTarget = new Map<string, string[]>()
  for (const edge of canvas.edges) {
    const sources = sourcesByTarget.get(edge.target) ?? []
    if (!sources.includes(edge.source)) sources.push(edge.source)
    sourcesByTarget.set(edge.target, sources)
  }
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        image: {
          ...node.data.image,
          sourceIds: sourcesByTarget.get(node.id) ?? [],
          parentId: sourcesByTarget.get(node.id)?.[0] ?? null,
        },
      },
    })),
  }
}

function relationEdge(source: string, target: string) {
  return { id: `edge-${source}-${target}`, source, target, type: 'smoothstep', interactionWidth: 24 }
}

function updateCanvas(
  canvases: Record<string, ProjectCanvasState>,
  projectId: string,
  update: (canvas: ProjectCanvasState) => ProjectCanvasState,
) {
  const canvas = canvases[projectId] ?? { nodes: [], edges: [], selectedNodeId: null }
  return { ...canvases, [projectId]: update(canvas) }
}

export function nodeFromDto(value: ImageDto): CanvasNode {
  return {
    id: value.id,
    type: 'image',
    position: { x: value.position_x, y: value.position_y },
    data: {
      image: {
        id: value.id,
        projectId: value.project_id,
        imageUrl: value.image_url,
        imageSource: 'stored',
        fileName: value.file_name,
        name: value.name,
        prompt: value.prompt,
        tags: value.tags,
        sourceIds: value.source_ids?.length ? value.source_ids : (value.parent_id ? [value.parent_id] : []),
        parentId: value.parent_id,
        createdTime: value.created_time,
        isOnCanvas: value.is_on_canvas ?? true,
        isFavorite: value.is_favorite ?? false,
        sourceType: value.source_type ?? 'uploaded',
      },
    },
  }
}

function canvasFromDtos(values: ImageDto[]): ProjectCanvasState {
  return {
    nodes: values.filter((value) => value.is_on_canvas !== false).map(nodeFromDto),
    edges: values.filter((value) => value.is_on_canvas !== false).flatMap((value) => {
      const sourceIds = value.source_ids?.length ? value.source_ids : (value.parent_id ? [value.parent_id] : [])
      return sourceIds.map((sourceId) => relationEdge(sourceId, value.id))
    }),
    selectedNodeId: null,
  }
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
  selectEdge: (projectId: string, edgeId: string) => void
  selectImportedBatch: (projectId: string, nodeIds: string[]) => void
  connectNodes: (projectId: string, connection: Connection) => void
  addUploadedImages: (projectId: string, files: readonly File[], position: XYPosition) => string[]
  duplicateNode: (projectId: string, nodeId: string) => string | null
  loadCanvas: (projectId: string) => Promise<void>
  uploadPersistedImages: (projectId: string, files: readonly File[], position: XYPosition) => Promise<string[]>
  persistPosition: (projectId: string, nodeId: string, position: XYPosition) => Promise<void>
  persistConnection: (projectId: string, source: string, target: string) => Promise<void>
  persistEdgeDeletion: (projectId: string, source: string, target: string) => Promise<void>
  persistMetadata: (projectId: string, nodeId: string, changes: ImagePatch) => Promise<void>
  duplicatePersistedNode: (projectId: string, nodeId: string) => Promise<string>
  deletePersistedNode: (projectId: string, nodeId: string) => Promise<void>
  deleteNode: (projectId: string, nodeId: string) => void
  updateImage: (projectId: string, nodeId: string, changes: Partial<Pick<CanvasImage, 'name' | 'prompt' | 'tags'>>) => void
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
  applyEdgeChanges: (projectId, changes) => {
    const removedIds = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id))
    const canvas = get().canvases[projectId]
    const removedEdges = canvas?.edges.filter((edge) => removedIds.has(edge.id)) ?? []
    const localChanges = changes.filter((change) => change.type !== 'remove')
    if (localChanges.length) {
      set((state) => ({
        canvases: updateCanvas(state.canvases, projectId, (current) => {
          const updated = { ...current, edges: applyEdgeChanges(localChanges, current.edges) }
          return localChanges.some((change) => change.type !== 'select') ? syncSourceIds(updated) : updated
        }),
      }))
    }
    for (const edge of removedEdges) {
      void get().persistEdgeDeletion(projectId, edge.source, edge.target).catch(() => undefined)
    }
  },
  selectNode: (projectId, nodeId) => set((state) => ({
    canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
      ...canvas,
      selectedNodeId: nodeId,
      nodes: canvas.nodes.map((node) => ({ ...node, selected: node.id === nodeId })),
      edges: canvas.edges.map((edge) => ({ ...edge, selected: false })),
    })),
  })),
  selectEdge: (projectId, edgeId) => set((state) => ({
    canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
      ...canvas,
      selectedNodeId: null,
      nodes: canvas.nodes.map((node) => ({ ...node, selected: false })),
      edges: canvas.edges.map((edge) => ({ ...edge, selected: edge.id === edgeId })),
    })),
  })),
  selectImportedBatch: (projectId, nodeIds) => {
    const requested = new Set(nodeIds)
    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => {
        const first = nodeIds.find((id) => canvas.nodes.some((node) => node.id === id)) ?? null
        return {
          ...canvas,
          selectedNodeId: first,
          nodes: canvas.nodes.map((node) => ({ ...node, selected: requested.has(node.id) })),
          edges: canvas.edges.map((edge) => ({ ...edge, selected: false })),
        }
      }),
    }))
  },
  connectNodes: (projectId, connection) => {
    const { source, target } = connection
    if (!source || !target || source === target) return

    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => {
        const sourceExists = canvas.nodes.some((node) => node.id === source)
        const targetExists = canvas.nodes.some((node) => node.id === target)
        if (!sourceExists || !targetExists) return canvas

        const duplicate = canvas.edges.some(
          (edge) => edge.source === source && edge.target === target,
        )
        if (duplicate) return canvas

        return syncSourceIds({
          ...canvas,
          edges: [...canvas.edges, relationEdge(source, target)],
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
              name: file.name.replace(/\.[^.]+$/, '') || '未命名图片',
              prompt: '尚未添加 Prompt',
              tags: [],
              sourceIds: [],
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
  updateImage: (projectId, nodeId, changes) => set((state) => ({
    canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
      ...canvas,
      nodes: canvas.nodes.map((node) => node.id === nodeId ? {
        ...node,
        data: {
          ...node.data,
          image: {
            ...node.data.image,
            ...changes,
            tags: changes.tags
              ? [...new Set(changes.tags.map((tag) => tag.trim()).filter(Boolean))]
              : node.data.image.tags,
          },
        },
      } : node),
    })),
    error: null,
  })),
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
          name: `${source.data.image.name} 副本`,
          id,
          sourceIds: [],
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
      canvases: updateCanvas(state.canvases, projectId, (canvas) => syncSourceIds({
        ...canvas,
        selectedNodeId: canvas.selectedNodeId === nodeId ? null : canvas.selectedNodeId,
        nodes: canvas.nodes.filter((item) => item.id !== nodeId),
        edges: canvas.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      })),
      error: null,
    }))
  },
  loadCanvas: async (projectId) => {
    const loadVersion = bumpProjectLoadVersion(projectId)
    useAppStore.getState().setSaveState('loading')
    try {
      const values = await resourcesApi.listImages(projectId)
      if (projectLoadVersions.get(projectId) !== loadVersion) return
      set((state) => ({ canvases: { ...state.canvases, [projectId]: canvasFromDtos(values) }, error: null }))
      useAppStore.getState().setSaveState('saved')
    } catch (error) {
      if (projectLoadVersions.get(projectId) !== loadVersion) return
      const message = error instanceof Error ? error.message : '画布加载失败'
      set({ error: message })
      useAppStore.getState().setSaveState('offline', message)
      throw error
    }
  },
  uploadPersistedImages: async (projectId, files, position) => {
    const validation = validateImageFiles(files)
    if (validation.errors.length) set({ error: validation.errors[0] })
    useAppStore.getState().setSaveState('saving')
    try {
      const values: ImageDto[] = []
      for (const [index, file] of validation.valid.entries()) {
        values.push(await resourcesApi.uploadImage(projectId, file, {
          prompt: '尚未添加 Prompt',
          positionX: position.x + (index % 2) * 270,
          positionY: position.y + Math.floor(index / 2) * 230,
        }))
      }
      set((state) => ({
        canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
          ...canvas,
          nodes: [...canvas.nodes, ...values.map(nodeFromDto)],
        })),
        error: validation.errors[0] ?? null,
      }))
      useAppStore.getState().setSaveState('saved')
      return values.map((value) => value.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片上传失败'
      set({ error: message })
      useAppStore.getState().setSaveState('error', message)
      throw error
    }
  },
  persistPosition: async (projectId, nodeId, position) => {
    useAppStore.getState().setSaveState('saving')
    try {
      await resourcesApi.patchImage(nodeId, { position_x: position.x, position_y: position.y })
      set((state) => ({ canvases: updateCanvas(state.canvases, projectId, (canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => node.id === nodeId ? { ...node, position } : node) })) }))
      useAppStore.getState().setSaveState('saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : '位置保存失败'
      useAppStore.getState().setSaveState('error', message)
      throw error
    }
  },
  persistConnection: async (projectId, source, target) => {
    bumpProjectLoadVersion(projectId)
    useAppStore.getState().setSaveState('saving')
    try {
      await resourcesApi.createImageRelation(source, target)
      bumpProjectLoadVersion(projectId)
      set((state) => ({ canvases: updateCanvas(state.canvases, projectId, (canvas) => syncSourceIds({
        ...canvas,
        edges: canvas.edges.some((edge) => edge.source === source && edge.target === target)
          ? canvas.edges
          : [...canvas.edges, relationEdge(source, target)],
      })) }))
      useAppStore.getState().setSaveState('saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : '关系保存失败'
      set({ error: message })
      useAppStore.getState().setSaveState('error', message)
      throw error
    }
  },
  persistEdgeDeletion: (projectId, source, target) => {
    const requestKey = `${projectId}\u0000${source}\u0000${target}`
    const existing = edgeDeletionRequests.get(requestKey)
    if (existing) return existing

    bumpProjectLoadVersion(projectId)
    set((state) => ({
      canvases: updateCanvas(state.canvases, projectId, (canvas) => ({
        ...canvas,
        edges: canvas.edges.map((edge) => edge.source === source && edge.target === target
          ? { ...edge, selected: false }
          : edge),
      })),
    }))
    useAppStore.getState().setSaveState('saving')
    const request = (async () => {
      try {
        await resourcesApi.deleteImageRelation(source, target)
        bumpProjectLoadVersion(projectId)
        set((state) => ({ canvases: updateCanvas(state.canvases, projectId, (canvas) => syncSourceIds({
          ...canvas,
          edges: canvas.edges.filter((edge) => edge.source !== source || edge.target !== target),
        })) }))
        useAppStore.getState().setSaveState('saved')
      } catch (error) {
        const message = error instanceof Error ? error.message : '关系删除失败'
        set({ error: message })
        useAppStore.getState().setSaveState('error', message)
        throw error
      }
    })().finally(() => edgeDeletionRequests.delete(requestKey))
    edgeDeletionRequests.set(requestKey, request)
    return request
  },
  persistMetadata: async (projectId, nodeId, changes) => {
    useAppStore.getState().setSaveState('saving')
    try {
      const value = await resourcesApi.patchImage(nodeId, changes)
      set((state) => ({ canvases: updateCanvas(state.canvases, projectId, (canvas) => ({ ...canvas, nodes: canvas.nodes.map((node) => node.id === nodeId ? nodeFromDto(value) : node) })) }))
      useAppStore.getState().setSaveState('saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : '信息保存失败'
      useAppStore.getState().setSaveState('error', message)
      throw error
    }
  },
  duplicatePersistedNode: async (projectId, nodeId) => {
    useAppStore.getState().setSaveState('saving')
    try {
      const value = await resourcesApi.duplicateImage(nodeId)
      set((state) => ({ canvases: updateCanvas(state.canvases, projectId, (canvas) => ({ ...canvas, selectedNodeId: value.id, nodes: [...canvas.nodes.map((node) => ({ ...node, selected: false })), { ...nodeFromDto(value), selected: true }] })) }))
      useAppStore.getState().setSaveState('saved')
      return value.id
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片复制失败'
      set({ error: message })
      useAppStore.getState().setSaveState('error', message)
      throw error
    }
  },
  deletePersistedNode: async (projectId, nodeId) => {
    useAppStore.getState().setSaveState('saving')
    try {
      await resourcesApi.patchImage(nodeId, { is_on_canvas: false })
      set((state) => ({ canvases: updateCanvas(state.canvases, projectId, (canvas) => syncSourceIds({ ...canvas, selectedNodeId: canvas.selectedNodeId === nodeId ? null : canvas.selectedNodeId, nodes: canvas.nodes.filter((node) => node.id !== nodeId), edges: canvas.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId) })) }))
      useAppStore.getState().setSaveState('saved')
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片删除失败'
      set({ error: message })
      useAppStore.getState().setSaveState('error', message)
      throw error
    }
  },
  reset: () => {
    projectLoadVersions.clear()
    edgeDeletionRequests.clear()
    set({ canvases: createInitialCanvases(), activeTool: 'select', error: null })
  },
}))

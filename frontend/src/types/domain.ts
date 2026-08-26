import type { Edge, Node } from '@xyflow/react'

export interface Project {
  id: string
  name: string
  createdTime: string
  imageCount: number
}

export type PromptCategory =
  | '摄影'
  | '产品设计'
  | '建筑'
  | '人物'
  | '电影感'
  | '插画'

export interface Prompt {
  id: string
  title: string
  content: string
  category: PromptCategory
  createdTime: string
}

export interface CanvasImage {
  id: string
  projectId: string | null
  imageUrl: string
  imageSource: 'fixture' | 'upload' | 'stored'
  fileName: string
  name: string
  prompt: string
  tags: string[]
  sourceIds: string[]
  parentId: string | null
  createdTime: string
  isOnCanvas?: boolean
  isFavorite?: boolean
  sourceType?: 'generated' | 'uploaded'
}

export interface CanvasNodeData extends Record<string, unknown> {
  image: CanvasImage
}

export type CanvasNode = Node<CanvasNodeData, 'image'>

export interface ProjectCanvasState {
  nodes: CanvasNode[]
  edges: Edge[]
  selectedNodeId: string | null
}

export type CanvasTool = 'select' | 'pan'

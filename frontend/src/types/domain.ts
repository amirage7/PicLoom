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
  projectId: string
  imageUrl: string
  imageSource: 'fixture' | 'upload'
  fileName: string
  prompt: string
  tags: string[]
  parentId: string | null
  createdTime: string
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

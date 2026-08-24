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

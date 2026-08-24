import { create } from 'zustand'

import type { Project, Prompt } from '../types/domain'


const projects: Project[] = [
  {
    id: 'future-city',
    name: '未来城市设计',
    createdTime: '2026-08-21T09:30:00+08:00',
    imageCount: 18,
  },
  {
    id: 'product-concepts',
    name: '产品概念图',
    createdTime: '2026-08-20T14:10:00+08:00',
    imageCount: 12,
  },
  {
    id: 'architecture',
    name: '建筑渲染',
    createdTime: '2026-08-18T11:45:00+08:00',
    imageCount: 9,
  },
]

const prompts: Prompt[] = [
  { id: 'editorial-photo', title: '编辑感产品摄影', content: 'Editorial product photography, controlled soft light, honest materials, restrained composition', category: '摄影', createdTime: '2026-08-20T10:00:00+08:00' },
  { id: 'industrial-object', title: '精密工业产品', content: 'Precision industrial design object, machined aluminum, functional details, neutral studio', category: '产品设计', createdTime: '2026-08-19T16:20:00+08:00' },
  { id: 'quiet-architecture', title: '静谧建筑空间', content: 'Quiet contemporary architecture, tactile concrete, diffused daylight, human scale', category: '建筑', createdTime: '2026-08-18T08:40:00+08:00' },
  { id: 'character-study', title: '自然人物肖像', content: 'Natural character portrait, subtle expression, soft directional light, true skin texture', category: '人物', createdTime: '2026-08-17T13:05:00+08:00' },
  { id: 'cinematic-night', title: '电影夜景', content: 'Cinematic night scene, motivated practical lighting, deep blacks, restrained color separation', category: '电影感', createdTime: '2026-08-16T20:15:00+08:00' },
  { id: 'editorial-illustration', title: '现代编辑插画', content: 'Contemporary editorial illustration, confident shapes, limited palette, tactile print texture', category: '插画', createdTime: '2026-08-15T09:25:00+08:00' },
]

interface AppState {
  projects: Project[]
  prompts: Prompt[]
  activeProjectId: string
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean
  selectProject: (projectId: string) => void
  toggleLeftPanel: () => void
  toggleRightPanel: () => void
}

export const useAppStore = create<AppState>((set) => ({
  projects,
  prompts,
  activeProjectId: projects[0].id,
  isLeftPanelOpen: true,
  isRightPanelOpen: true,
  selectProject: (activeProjectId) => set({ activeProjectId }),
  toggleLeftPanel: () => set((state) => ({ isLeftPanelOpen: !state.isLeftPanelOpen })),
  toggleRightPanel: () => set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen })),
}))

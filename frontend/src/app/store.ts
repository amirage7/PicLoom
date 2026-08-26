import { create } from 'zustand'

import type { Project, Prompt } from '../types/domain'
import * as resourcesApi from '../lib/resourcesApi'
import type { ImageDto, ProjectDto, PromptDto } from '../lib/resourcesApi'


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

export type SaveStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'offline'
export type WorkspaceMode = 'quick' | 'project'
export type ProjectView = 'canvas' | 'gallery'

const toProject = (value: ProjectDto): Project => ({
  id: value.id,
  name: value.name,
  createdTime: value.created_time,
  imageCount: value.image_count,
})

const toPrompt = (value: PromptDto): Prompt => ({
  id: value.id,
  title: value.title,
  content: value.content,
  category: value.category as Prompt['category'],
  createdTime: value.created_time,
})

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '保存失败'

interface AppState {
  projects: Project[]
  prompts: Prompt[]
  activeProjectId: string
  workspaceMode: WorkspaceMode
  projectView: ProjectView
  unarchivedCount: number
  selectedGalleryImage: ImageDto | null
  isLeftPanelOpen: boolean
  isRightPanelOpen: boolean
  selectProject: (projectId: string) => void
  selectQuickCreation: () => void
  setProjectView: (view: ProjectView) => void
  setSelectedGalleryImage: (image: ImageDto | null) => void
  refreshUnarchivedCount: () => Promise<void>
  toggleLeftPanel: () => void
  setLeftPanelOpen: (value: boolean) => void
  setRightPanelOpen: (value: boolean) => void
  saveStatus: SaveStatus
  error: string | null
  hydrateResources: () => Promise<void>
  createProject: (name: string) => Promise<Project>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  createPrompt: (value: Pick<Prompt, 'title' | 'content' | 'category'>) => Promise<Prompt>
  editPrompt: (id: string, value: Partial<Pick<Prompt, 'title' | 'content' | 'category'>>) => Promise<void>
  duplicatePrompt: (id: string) => Promise<Prompt>
  deletePrompt: (id: string) => Promise<void>
  setSaveState: (saveStatus: SaveStatus, error?: string | null) => void
  toggleRightPanel: () => void
}

export const useAppStore = create<AppState>((set, get) => ({
  projects,
  prompts,
  activeProjectId: projects[0].id,
  workspaceMode: 'project',
  projectView: 'canvas',
  unarchivedCount: 0,
  selectedGalleryImage: null,
  isLeftPanelOpen: true,
  isRightPanelOpen: true,
  selectProject: (activeProjectId) => set({ activeProjectId, workspaceMode: 'project', selectedGalleryImage: null }),
  selectQuickCreation: () => set({ workspaceMode: 'quick', selectedGalleryImage: null }),
  setProjectView: (projectView) => set({ projectView, selectedGalleryImage: projectView === 'canvas' ? null : get().selectedGalleryImage }),
  setSelectedGalleryImage: (selectedGalleryImage) => set({ selectedGalleryImage }),
  refreshUnarchivedCount: async () => {
    const values = await resourcesApi.listUnarchivedImages()
    set({ unarchivedCount: values.length })
  },
  toggleLeftPanel: () => set((state) => ({ isLeftPanelOpen: !state.isLeftPanelOpen })),
  setLeftPanelOpen: (isLeftPanelOpen) => set({ isLeftPanelOpen }),
  setRightPanelOpen: (isRightPanelOpen) => set({ isRightPanelOpen }),
  toggleRightPanel: () => set((state) => ({ isRightPanelOpen: !state.isRightPanelOpen })),
  saveStatus: 'idle',
  error: null,
  setSaveState: (saveStatus, error = null) => set({ saveStatus, error }),
  hydrateResources: async () => {
    set({ saveStatus: 'loading', error: null })
    try {
      const [projectDtos, promptDtos, unarchived] = await Promise.all([
        resourcesApi.listProjects(),
        resourcesApi.listPrompts(),
        resourcesApi.listUnarchivedImages().catch(() => []),
      ])
      const nextProjects = projectDtos.map(toProject)
      const currentId = get().activeProjectId
      set({
        projects: nextProjects,
        prompts: promptDtos.map(toPrompt),
        unarchivedCount: unarchived.length,
        activeProjectId: nextProjects.some((item) => item.id === currentId)
          ? currentId
          : nextProjects[0]?.id ?? '',
        saveStatus: 'saved',
        error: null,
      })
    } catch (error) {
      set({ saveStatus: 'offline', error: errorMessage(error) })
      throw error
    }
  },
  createProject: async (name) => {
    set({ saveStatus: 'saving', error: null })
    try {
      const project = toProject(await resourcesApi.createProject(name))
      set((state) => ({
        projects: [...state.projects, project],
        activeProjectId: project.id,
        workspaceMode: 'project',
        saveStatus: 'saved',
      }))
      return project
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
  renameProject: async (id, name) => {
    set({ saveStatus: 'saving', error: null })
    try {
      const updated = toProject(await resourcesApi.renameProject(id, name))
      set((state) => ({ projects: state.projects.map((item) => item.id === id ? updated : item), saveStatus: 'saved' }))
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
  deleteProject: async (id) => {
    set({ saveStatus: 'saving', error: null })
    try {
      await resourcesApi.deleteProject(id)
      set((state) => {
        const remaining = state.projects.filter((item) => item.id !== id)
        return { projects: remaining, activeProjectId: state.activeProjectId === id ? remaining[0]?.id ?? '' : state.activeProjectId, saveStatus: 'saved' }
      })
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
  createPrompt: async (value) => {
    set({ saveStatus: 'saving', error: null })
    try {
      const prompt = toPrompt(await resourcesApi.createPrompt(value))
      set((state) => ({ prompts: [prompt, ...state.prompts], saveStatus: 'saved' }))
      return prompt
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
  editPrompt: async (id, value) => {
    set({ saveStatus: 'saving', error: null })
    try {
      const updated = toPrompt(await resourcesApi.updatePrompt(id, value))
      set((state) => ({ prompts: state.prompts.map((item) => item.id === id ? updated : item), saveStatus: 'saved' }))
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
  duplicatePrompt: async (id) => {
    set({ saveStatus: 'saving', error: null })
    try {
      const prompt = toPrompt(await resourcesApi.duplicatePrompt(id))
      set((state) => ({ prompts: [prompt, ...state.prompts], saveStatus: 'saved' }))
      return prompt
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
  deletePrompt: async (id) => {
    set({ saveStatus: 'saving', error: null })
    try {
      await resourcesApi.deletePrompt(id)
      set((state) => ({ prompts: state.prompts.filter((item) => item.id !== id), saveStatus: 'saved' }))
    } catch (error) {
      set({ saveStatus: 'error', error: errorMessage(error) })
      throw error
    }
  },
}))

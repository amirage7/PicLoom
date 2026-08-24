import { beforeEach, describe, expect, it } from 'vitest'

import { useAppStore } from './store'


describe('app store', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeProjectId: 'future-city',
      isLeftPanelOpen: true,
      isRightPanelOpen: true,
    })
  })

  it('switches the active project', () => {
    useAppStore.getState().selectProject('product-concepts')

    expect(useAppStore.getState().activeProjectId).toBe('product-concepts')
  })

  it('toggles both supporting panels independently', () => {
    useAppStore.getState().toggleLeftPanel()
    useAppStore.getState().toggleRightPanel()

    expect(useAppStore.getState().isLeftPanelOpen).toBe(false)
    expect(useAppStore.getState().isRightPanelOpen).toBe(false)
  })
})

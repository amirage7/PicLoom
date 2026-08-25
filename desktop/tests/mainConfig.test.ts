import { describe, expect, it } from 'vitest'

import {
  DEVELOPMENT_BACKEND_PORT,
  createMainWindowOptions,
  resolveRendererTarget,
} from '../src/mainConfig.js'

describe('desktop main window configuration', () => {
  it('uses the same backend port as the Vite development proxy', () => {
    expect(DEVELOPMENT_BACKEND_PORT).toBe(8001)
  })

  it('hardens the React renderer and uses only the local preload', () => {
    expect(createMainWindowOptions('C:\\app\\preload.js')).toMatchObject({
      show: false,
      backgroundColor: '#080d0c',
      webPreferences: {
        preload: 'C:\\app\\preload.js',
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })
  })

  it('uses loopback Vite in development and bundled files when packaged', () => {
    expect(resolveRendererTarget({
      packaged: false,
      resourcesPath: 'C:\\resources',
      developmentUrl: 'http://127.0.0.1:3000',
    })).toEqual({ kind: 'url', value: 'http://127.0.0.1:3000' })
    expect(resolveRendererTarget({
      packaged: true,
      resourcesPath: 'C:\\Program Files\\AI Image Canvas\\resources',
    })).toEqual({
      kind: 'file',
      value: 'C:\\Program Files\\AI Image Canvas\\resources\\frontend\\dist\\index.html',
    })
  })

  it('rejects a non-loopback development renderer', () => {
    expect(() => resolveRendererTarget({
      packaged: false,
      resourcesPath: 'C:\\resources',
      developmentUrl: 'https://example.com',
    })).toThrow('Development renderer must use http://127.0.0.1:3000')
  })
})

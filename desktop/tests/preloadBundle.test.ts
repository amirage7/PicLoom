import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { buildSandboxedPreload } from '../src/buildPreload.js'


const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(
    (directory) => rm(directory, { recursive: true, force: true }),
  ))
})

describe('sandboxed preload bundle', () => {
  it('emits one CommonJS file with no runtime local module imports', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'aic-preload-'))
    temporaryDirectories.push(directory)
    const output = path.join(directory, 'preload.cjs')

    await buildSandboxedPreload(path.resolve('src/preload.ts'), output)

    const source = await readFile(output, 'utf8')
    expect(source).toContain('require("electron")')
    expect(source).not.toMatch(/\bimport\s/)
    expect(source).not.toMatch(/require\(["']\.\/preloadBridge/)
  })
})

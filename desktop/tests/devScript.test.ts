import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'


describe('desktop development command', () => {
  it('launches the compiled Electron main entry', () => {
    const packageJson = JSON.parse(
      readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> }

    expect(packageJson.scripts.dev).toContain('electron dist/src/main.js')
  })
})

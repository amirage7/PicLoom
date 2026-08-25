import { cp, mkdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(import.meta.dirname, '..')
const dist = resolve(root, 'dist')
await rm(dist, { recursive: true, force: true })
await mkdir(dist, { recursive: true })
await build({
  entryPoints: {
    background: resolve(root, 'src/background.ts'),
    content: resolve(root, 'src/content.ts'),
    popup: resolve(root, 'src/popup.ts'),
  },
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  outdir: dist,
})
await Promise.all([
  cp(resolve(root, 'src/manifest.json'), resolve(dist, 'manifest.json')),
  cp(resolve(root, 'src/popup.html'), resolve(dist, 'popup.html')),
  cp(resolve(root, 'src/popup.css'), resolve(dist, 'popup.css')),
])

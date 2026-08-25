import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { build } from 'esbuild'


export async function buildSandboxedPreload(entryPoint: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
    sourcemap: true,
    logLevel: 'silent',
  })
}

function isDirectExecution(): boolean {
  const scriptPath = process.argv[1]
  return scriptPath !== undefined && import.meta.url === pathToFileURL(scriptPath).href
}

if (isDirectExecution()) {
  await buildSandboxedPreload(
    path.resolve('src/preload.ts'),
    path.resolve('dist/src/preload.cjs'),
  )
}

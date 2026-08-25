import path from 'node:path'

const HEALTH_TIMEOUT_MS = 20_000
const HEALTH_POLL_INTERVAL_MS = 250
const STOP_TIMEOUT_MS = 5_000

export interface BackendProcess {
  kill(signal?: NodeJS.Signals): boolean
  readonly pid?: number | undefined
  once(name: 'exit', callback: (code: number | null) => void): void
}

export interface BackendSupervisorOptions {
  packaged: boolean
  resourcesPath: string
  repoRoot: string
  port: number
  spawnProcess(command: string, args: string[], cwd: string): BackendProcess
  probe(url: string): Promise<boolean>
  killProcessTree?(pid: number): Promise<void>
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export class BackendSupervisor {
  private child: BackendProcess | null = null
  private exitCode: number | null | undefined
  private exitPromise: Promise<void> | null = null
  private resolveExit: (() => void) | null = null

  constructor(private readonly options: BackendSupervisorOptions) {}

  get baseUrl(): string {
    return `http://127.0.0.1:${this.options.port}`
  }

  async start(): Promise<void> {
    if (this.child) return

    const launch = this.resolveLaunchCommand()
    this.exitCode = undefined
    this.exitPromise = new Promise((resolve) => {
      this.resolveExit = resolve
    })
    this.child = this.options.spawnProcess(launch.command, launch.args, launch.cwd)
    this.child.once('exit', (code) => {
      this.exitCode = code
      this.resolveExit?.()
    })

    const startedAt = Date.now()
    const healthUrl = `${this.baseUrl}/api/health`
    while (Date.now() - startedAt <= HEALTH_TIMEOUT_MS) {
      if (this.exitCode !== undefined) {
        throw new Error(`FastAPI backend exited with code ${String(this.exitCode)}`)
      }
      if (await this.options.probe(healthUrl)) return
      await delay(HEALTH_POLL_INTERVAL_MS)
    }

    throw new Error(`FastAPI backend did not become healthy within ${HEALTH_TIMEOUT_MS}ms`)
  }

  async stop(): Promise<void> {
    const child = this.child
    const exitPromise = this.exitPromise
    if (!child || !exitPromise) return

    if (child.pid !== undefined && this.options.killProcessTree) {
      await this.options.killProcessTree(child.pid)
    } else {
      child.kill('SIGTERM')
    }
    const stopped = await Promise.race([
      exitPromise.then(() => true),
      delay(STOP_TIMEOUT_MS).then(() => false),
    ])
    if (!stopped) child.kill('SIGKILL')

    this.child = null
    this.exitPromise = null
    this.resolveExit = null
  }

  private resolveLaunchCommand(): { command: string; args: string[]; cwd: string } {
    const port = String(this.options.port)
    if (this.options.packaged) {
      const cwd = path.join(this.options.resourcesPath, 'backend')
      return {
        command: path.join(cwd, 'ai-image-canvas-backend.exe'),
        args: ['--port', port],
        cwd,
      }
    }

    const cwd = path.join(this.options.repoRoot, 'backend')
    return {
      command: path.join(cwd, '.venv', 'Scripts', 'python.exe'),
      args: ['-m', 'app.desktop_entry', '--port', port],
      cwd,
    }
  }
}

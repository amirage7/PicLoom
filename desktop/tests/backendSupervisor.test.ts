import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BackendSupervisor,
  type BackendProcess,
  type BackendSupervisorOptions,
} from '../src/backendSupervisor.js'

class FakeProcess implements BackendProcess {
  readonly signals: Array<NodeJS.Signals | undefined> = []
  private exitListener: ((code: number | null) => void) | undefined

  kill(signal?: NodeJS.Signals) {
    this.signals.push(signal)
    return true
  }

  once(name: 'exit', listener: (code: number | null) => void) {
    if (name === 'exit') this.exitListener = listener
  }

  exit(code: number | null) {
    this.exitListener?.(code)
  }
}

interface Harness {
  supervisor: BackendSupervisor
  process: FakeProcess
  calls: Array<{ command: string; args: string[]; cwd: string }>
}

function createHarness(overrides: Partial<BackendSupervisorOptions> = {}): Harness {
  const process = new FakeProcess()
  const calls: Harness['calls'] = []
  const options: BackendSupervisorOptions = {
    packaged: false,
    resourcesPath: 'C:\\Program Files\\AI Image Canvas\\resources',
    repoRoot: 'E:\\AI Image Canvas',
    port: 8123,
    spawnProcess(command, args, cwd) {
      calls.push({ command, args, cwd })
      return process
    },
    probe: async () => true,
    ...overrides,
  }
  return { supervisor: new BackendSupervisor(options), process, calls }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('BackendSupervisor', () => {
  it('starts the development Python entry point without shell quoting', async () => {
    const { supervisor, calls } = createHarness()

    await supervisor.start()

    expect(calls).toEqual([{
      command: path.join('E:\\AI Image Canvas', 'backend', '.venv', 'Scripts', 'python.exe'),
      args: ['-m', 'app.desktop_entry', '--port', '8123'],
      cwd: path.join('E:\\AI Image Canvas', 'backend'),
    }])
    expect(supervisor.baseUrl).toBe('http://127.0.0.1:8123')
  })

  it('starts the packaged executable even when resources path contains spaces', async () => {
    const { supervisor, calls } = createHarness({ packaged: true })

    await supervisor.start()

    expect(calls[0]).toEqual({
      command: path.join(
        'C:\\Program Files\\AI Image Canvas\\resources',
        'backend',
        'ai-image-canvas-backend.exe',
      ),
      args: ['--port', '8123'],
      cwd: path.join('C:\\Program Files\\AI Image Canvas\\resources', 'backend'),
    })
  })

  it('probes the loopback health endpoint until it is ready', async () => {
    vi.useFakeTimers()
    const probe = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const { supervisor } = createHarness({ probe })

    const started = supervisor.start()
    await vi.advanceTimersByTimeAsync(250)
    await started

    expect(probe).toHaveBeenCalledWith('http://127.0.0.1:8123/api/health')
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('reports an early child exit code instead of waiting for timeout', async () => {
    vi.useFakeTimers()
    const { supervisor, process } = createHarness({ probe: async () => false })

    const started = supervisor.start()
    const rejection = expect(started).rejects.toThrow('exited with code 7')
    process.exit(7)
    await vi.advanceTimersByTimeAsync(250)
    await rejection
  })

  it('times out after twenty seconds when health never becomes ready', async () => {
    vi.useFakeTimers()
    const { supervisor } = createHarness({ probe: async () => false })

    const started = supervisor.start()
    const rejection = expect(started).rejects.toThrow('did not become healthy within 20000ms')
    await vi.advanceTimersByTimeAsync(20_250)

    await rejection
  })

  it('sends SIGTERM and waits for the owned child to exit', async () => {
    const { supervisor, process } = createHarness()
    await supervisor.start()

    const stopped = supervisor.stop()
    expect(process.signals).toEqual(['SIGTERM'])
    process.exit(0)
    await stopped

    expect(process.signals).toEqual(['SIGTERM'])
  })
})

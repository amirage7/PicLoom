import { ExternalLink, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import { IconButton } from '../../components/IconButton'
import { createPairingCode } from './generationApi'
import { useGenerationStore } from './generationStore'
import './generation.css'


interface GenerationPanelProps { projectId: string; onCompleted(imageId: string): void }
const running = new Set(['queued', 'connecting', 'sending', 'generating', 'downloading'])

export function GenerationPanel({ projectId, onCompleted }: GenerationPanelProps) {
  const [pairingCode, setPairingCode] = useState<string | null>(null)
  const { prompt, availability, task, error, setPrompt, setPanelOpen, refreshAvailability, generate, cancel } = useGenerationStore()
  const isRunning = task ? running.has(task.status) : false

  useEffect(() => {
    void refreshAvailability()
    const intervalId = window.setInterval(() => { void refreshAvailability() }, 3_000)
    return () => window.clearInterval(intervalId)
  }, [refreshAvailability])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = await generate(projectId, prompt.trim())
    if (result?.status === 'completed' && result.imageId) onCompleted(result.imageId)
  }

  return (
    <aside className="generation-panel" aria-label="ChatGPT 生图">
      <header><div><strong>ChatGPT 生图</strong><span>普通 Chat · 本机桥接</span></div><IconButton label="关闭生图面板" onClick={() => setPanelOpen(false)}><X size={15} /></IconButton></header>
      {!availability?.online && (
        <section className="generation-connect">
          <strong>连接 ChatGPT</strong>
          <p>加载 Chrome 扩展，在官方 ChatGPT 页面手动登录，然后使用一次性配对码。</p>
          <button type="button" onClick={() => void createPairingCode().then((value) => setPairingCode(value.code))}>生成配对码</button>
          {pairingCode && <output className="pairing-code" aria-label="配对码">{pairingCode}</output>}
          <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">打开 ChatGPT <ExternalLink size={13} /></a>
        </section>
      )}
      <form onSubmit={submit} className="generation-form">
        <label htmlFor="generation-prompt">Prompt</label>
        <textarea id="generation-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="描述你想生成的图片…" rows={6} />
        <button type="submit" disabled={!availability?.online || isRunning || !prompt.trim()}>使用 ChatGPT 生成</button>
      </form>
      {task && <div className="generation-progress" role="status"><span data-status={task.status} />{task.progressMessage}</div>}
      {error && <div className="generation-error" role="alert">{error}</div>}
      {isRunning && <button className="generation-cancel" type="button" onClick={() => void cancel()}>取消任务</button>}
    </aside>
  )
}

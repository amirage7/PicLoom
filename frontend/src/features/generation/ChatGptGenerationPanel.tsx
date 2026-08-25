import { Eye, EyeOff, RefreshCw, RotateCcw, Send, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import { getDesktopBridge } from '../desktop/desktopBridge'

interface ChatGptGenerationPanelProps {
  projectId: string
}

export function ChatGptGenerationPanel({ projectId }: ChatGptGenerationPanelProps) {
  const bridge = getDesktopBridge()
  const viewSlotRef = useRef<HTMLDivElement>(null)
  const [prompt, setPrompt] = useState('')
  const [viewVisible, setViewVisible] = useState(false)
  const [pending, setPending] = useState(false)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState('登录后，可在这里直接使用普通 Chat 生成图片。')
  const [error, setError] = useState<string | null>(null)

  const reportViewBounds = useCallback(() => {
    const slot = viewSlotRef.current
    if (!bridge || !slot) return
    const rectangle = slot.getBoundingClientRect()
    void bridge.setChatGptView({
      visible: true,
      bounds: {
        x: Math.max(0, Math.floor(rectangle.x)),
        y: Math.max(0, Math.floor(rectangle.y)),
        width: Math.max(0, Math.floor(rectangle.width)),
        height: Math.max(0, Math.floor(rectangle.height)),
      },
    })
  }, [bridge])

  useEffect(() => {
    if (!bridge || !viewVisible) return
    reportViewBounds()
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(reportViewBounds)
    if (viewSlotRef.current) observer?.observe(viewSlotRef.current)
    window.addEventListener('resize', reportViewBounds)
    window.addEventListener('scroll', reportViewBounds, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', reportViewBounds)
      window.removeEventListener('scroll', reportViewBounds, true)
      void bridge.setChatGptView({ visible: false })
    }
  }, [bridge, reportViewBounds, viewVisible])

  useEffect(() => () => {
    void bridge?.setChatGptView({ visible: false })
  }, [bridge])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!bridge || !prompt.trim() || pending) return
    const nextTaskId = globalThis.crypto?.randomUUID?.() ?? `task-${Date.now()}`
    setTaskId(nextTaskId)
    setPending(true)
    setError(null)
    setMessage('正在把 Prompt 发送到 ChatGPT…')
    try {
      await bridge.startGeneration({
        taskId: nextTaskId,
        projectId,
        prompt: prompt.trim(),
        parentImageId: null,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '暂时无法启动生成任务')
    } finally {
      setPending(false)
    }
  }

  const hideView = () => {
    setViewVisible(false)
    void bridge?.setChatGptView({ visible: false })
  }

  const reloadChatGpt = async () => {
    if (!bridge) return
    setError(null)
    try {
      await bridge.reloadChatGpt()
      setMessage('ChatGPT 页面已重新加载。')
    } catch {
      setError('无法重新加载 ChatGPT 页面，请稍后重试。')
    }
  }

  return (
    <div className="desktop-generation-content">
      <section className="desktop-generation-intro">
        <h2>ChatGPT 生图</h2>

        <p>普通 Chat · 独立登录会话</p>
      </section>

      <div className="desktop-chat-view-actions">
        <button type="button" onClick={() => setViewVisible(true)} disabled={!bridge || viewVisible}>
          <Eye size={14} />登录 / 查看 ChatGPT
        </button>
        <button type="button" onClick={hideView} disabled={!viewVisible}>
          <EyeOff size={14} />隐藏 ChatGPT
        </button>
      </div>

      <button className="desktop-chat-reload" type="button" onClick={() => void reloadChatGpt()} disabled={!bridge}>
        <RefreshCw size={14} />重新加载 ChatGPT 页面
      </button>

      {viewVisible && (
        <div ref={viewSlotRef} className="desktop-chat-view-slot" aria-label="ChatGPT 页面区域">
          <span>ChatGPT 页面加载中…</span>
        </div>
      )}

      <form className="desktop-generation-form" onSubmit={submit}>
        <label htmlFor="desktop-generation-prompt">Prompt</label>
        <textarea
          id="desktop-generation-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="描述你想生成的图片…"
          rows={7}
        />
        <button className="desktop-generation-submit" type="submit" disabled={!bridge || pending || !prompt.trim()}>
          <Send size={15} />{pending ? '正在启动…' : '使用 ChatGPT 生成'}
        </button>
      </form>

      <div className="desktop-generation-status" role="status"><span />{message}</div>
      {error && <div className="desktop-generation-error" role="alert">{error}</div>}

      <div className="desktop-generation-secondary-actions">
        <button type="button" disabled={!taskId || !pending} onClick={() => taskId && void bridge?.cancelGeneration(taskId)}>
          <Square size={13} />取消
        </button>
        <button type="button" disabled={!taskId} onClick={() => taskId && void bridge?.retryCollection(taskId)}>
          <RotateCcw size={13} />重试收集图片
        </button>
      </div>
    </div>
  )
}

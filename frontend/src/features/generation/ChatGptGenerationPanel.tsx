import { Eraser, Eye, EyeOff, RefreshCw, RotateCcw, Send, Square } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { useCanvasStore } from '../canvas/store/canvasStore'
import { getDesktopBridge } from '../desktop/desktopBridge'
import { ImageMentionMenu } from './ImageMentionMenu'
import { cancelGenerationTask, createGenerationTask } from './generationApi'
import { ensureDesktopGenerationEvents, useGenerationStore } from './generationStore'
import type { DesktopReferenceImage } from '../desktop/types'
import * as resourcesApi from '../../lib/resourcesApi'
import {
  filterMentionCandidates,
  findActiveMention,
  findInvalidMentions,
  insertMention,
  resolveImageMentions,
  type MentionImage,
} from './imageMentions'

interface ChatGptGenerationPanelProps {
  projectId: string | null
}

export function ChatGptGenerationPanel({ projectId }: ChatGptGenerationPanelProps) {
  const bridge = getDesktopBridge()
  const viewSlotRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const startingRef = useRef(false)
  const canvas = useCanvasStore((state) => projectId ? state.canvases[projectId] : undefined)
  const prompt = useGenerationStore((state) => state.prompt)
  const setPrompt = useGenerationStore((state) => state.setPrompt)
  const transparentBackground = useGenerationStore((state) => state.transparentBackground)
  const setTransparentBackground = useGenerationStore((state) => state.setTransparentBackground)
  const quickAction = useGenerationStore((state) => state.quickAction)
  const consumeQuickAction = useGenerationStore((state) => state.consumeQuickAction)
  const pending = useGenerationStore((state) => state.desktopBusy)
  const taskId = useGenerationStore((state) => state.desktopTaskId ?? state.desktopRecoverableTaskId)
  const generationEvent = useGenerationStore((state) => state.desktopEvent)
  const acquireDesktopGeneration = useGenerationStore((state) => state.acquireDesktopGeneration)
  const bindDesktopTask = useGenerationStore((state) => state.bindDesktopTask)
  const releaseDesktopGeneration = useGenerationStore((state) => state.releaseDesktopGeneration)
  const [caret, setCaret] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [viewVisible, setViewVisible] = useState(false)
  const [recoverable, setRecoverable] = useState(false)
  const [message, setMessage] = useState('登录后，可在这里直接使用普通 Chat 生成图片。')
  const [error, setError] = useState<string | null>(null)
  const [scopeImages, setScopeImages] = useState<MentionImage[]>([])

  useEffect(() => {
    const request = projectId ? resourcesApi.listImages(projectId) : resourcesApi.listUnarchivedImages()
    void request.then((values) => setScopeImages(values.map((image) => ({ imageId: image.id, name: image.name, imageUrl: image.image_url })))).catch(() => setScopeImages([]))
  }, [projectId])

  const canvasImages: MentionImage[] = (canvas?.nodes ?? []).map((node) => ({
    imageId: node.id,
    name: node.data.image.name,
    imageUrl: node.data.image.imageUrl,
  }))
  const mentionImages = scopeImages.length > 0 ? scopeImages : canvasImages
  const activeMention = findActiveMention(prompt, caret)
  const mentionCandidates = activeMention
    ? filterMentionCandidates(mentionImages, activeMention.query)
    : []
  const resolvedReferences = resolveImageMentions(prompt, mentionImages)

  useEffect(() => setMentionIndex(0), [activeMention?.query, mentionCandidates.length])

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

  useEffect(() => {
    if (bridge) ensureDesktopGenerationEvents(bridge)
  }, [bridge])

  useEffect(() => {
    if (!generationEvent) return
    setMessage(generationEvent.message)
    setRecoverable(generationEvent.recoverable)
    if (generationEvent.state === 'login_required' || generationEvent.state === 'page_changed') {
      setViewVisible(true)
    }
    if (generationEvent.state === 'failed' || generationEvent.state === 'refused') {
      setError(generationEvent.message)
    } else {
      setError(null)
    }
  }, [generationEvent])

  const selectMention = (image: MentionImage) => {
    if (!activeMention) return
    const next = insertMention(prompt, activeMention, image.name)
    setPrompt(next.prompt)
    setCaret(next.caret)
    setMentionIndex(0)
    window.setTimeout(() => {
      promptRef.current?.focus()
      promptRef.current?.setSelectionRange(next.caret, next.caret)
    }, 0)
  }

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!activeMention || mentionCandidates.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setMentionIndex((index) => (index + 1) % mentionCandidates.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setMentionIndex((index) => (index - 1 + mentionCandidates.length) % mentionCandidates.length)
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      selectMention(mentionCandidates[Math.min(mentionIndex, mentionCandidates.length - 1)])
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setCaret(-1)
    }
  }

  const startGeneration = useCallback(async (
    requestedPrompt: string,
    requestedReferences?: DesktopReferenceImage[],
    requestedTransparentBackground = transparentBackground,
  ) => {
    const compactPrompt = requestedPrompt.trim()
    if (!compactPrompt) return
    if (!bridge) {
      setError('当前未连接桌面版 ChatGPT，Prompt 已保留，可连接后手动重试。')
      return
    }
    if (!requestedReferences) {
      const invalidMentions = findInvalidMentions(compactPrompt, mentionImages)
      if (invalidMentions.length > 0) {
        setError(`找不到引用图片：@${invalidMentions.join('、@')}。请重新输入 @ 选择图片。`)
        return
      }
    }
    const references = requestedReferences ?? resolveImageMentions(compactPrompt, mentionImages)
    if (startingRef.current || !acquireDesktopGeneration()) {
      setError('当前有图片正在生成，请完成或取消后再试。')
      return
    }
    startingRef.current = true
    setRecoverable(false)
    setError(null)
    setMessage('正在把 Prompt 发送到 ChatGPT…')
    let createdTaskId: string | null = null
    try {
      const parentImageId = references[0]?.imageId
      const task = await createGenerationTask(projectId, compactPrompt, parentImageId)
      const nextTaskId = task.id
      createdTaskId = nextTaskId
      bindDesktopTask(nextTaskId, projectId)
      await bridge.startGeneration({
        taskId: nextTaskId,
        projectId,
        prompt: compactPrompt,
        parentImageId: parentImageId ?? null,
        referenceImages: references,
        transparentBackground: requestedTransparentBackground,
      })
    } catch (cause) {
      if (createdTaskId) {
        await cancelGenerationTask(createdTaskId).catch(() => undefined)
      }
      releaseDesktopGeneration(createdTaskId ?? undefined)
      const detail = cause instanceof Error ? cause.message : '暂时无法启动生成任务'
      setError(detail.includes('GENERATION_ALREADY_ACTIVE')
        ? '当前有图片正在生成，请完成或取消后再试。'
        : detail)
    } finally {
      startingRef.current = false
    }
  }, [acquireDesktopGeneration, bindDesktopTask, bridge, mentionImages, projectId, releaseDesktopGeneration, transparentBackground])

  useEffect(() => {
    if (!projectId || !quickAction || quickAction.projectId !== projectId) return
    const action = consumeQuickAction(projectId)
    if (!action) return
    void startGeneration(action.prompt, action.referenceImages, action.transparentBackground)
  }, [consumeQuickAction, projectId, quickAction, startGeneration])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void startGeneration(prompt)
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
        <div className="desktop-prompt-editor">
          <textarea
            ref={promptRef}
            id="desktop-generation-prompt"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value)
              setCaret(event.target.selectionStart ?? event.target.value.length)
              setError(null)
            }}
            onClick={(event) => setCaret(event.currentTarget.selectionStart ?? prompt.length)}
            onKeyUp={(event) => {
              if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
                setCaret(event.currentTarget.selectionStart ?? prompt.length)
              }
            }}
            onKeyDown={handlePromptKeyDown}
            placeholder="描述你想生成的图片；输入 @ 引用画布图片…"
            rows={7}
          />
          {activeMention && mentionCandidates.length > 0 && (
            <ImageMentionMenu
              images={mentionCandidates}
              activeIndex={Math.min(mentionIndex, mentionCandidates.length - 1)}
              onSelect={selectMention}
            />
          )}
        </div>
        <p className="desktop-mention-help">输入 @ 后选择图片，可在同一 Prompt 中引用多张。</p>
        <button
          className="desktop-transparent-option"
          type="button"
          aria-label="透明背景"
          aria-pressed={transparentBackground}
          onClick={() => setTransparentBackground(!transparentBackground)}
        >
          <Eraser size={14} />
          <span><strong>透明背景</strong><small>直接生成无背景图片</small></span>
        </button>
        {resolvedReferences.length > 0 && (
          <div className="desktop-mention-summary" aria-label={`将引用 ${resolvedReferences.length} 张图片`}>
            <span>将引用 {resolvedReferences.length} 张图片</span>
            <div>{resolvedReferences.map((reference) => <small key={reference.imageId}>@{reference.name}</small>)}</div>
          </div>
        )}
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
        <button type="button" disabled={!taskId || !recoverable} onClick={() => taskId && void bridge?.retryCollection(taskId)}>
          <RotateCcw size={13} />重试收集图片
        </button>
      </div>
    </div>
  )
}

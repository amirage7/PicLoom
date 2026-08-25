import { ChatPageAdapter } from './chatPageAdapter'
import { executeTask, TaskExecutionError } from './taskExecutor'


const adapter = new ChatPageAdapter(document)


function waitForCompletedImage(timeoutMs = 10 * 60 * 1000): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      observer.disconnect()
      clearInterval(interval)
      callback()
    }
    const check = async () => {
      if (adapter.getState() === 'rejected') {
        finish(() => reject(new TaskExecutionError('GENERATION_REJECTED', 'ChatGPT 拒绝了该请求')))
        return
      }
      const image = adapter.findCompletedImage()
      if (image?.src) {
        try {
          const response = await fetch(image.src)
          if (!response.ok) throw new Error(String(response.status))
          const blob = await response.blob()
          finish(() => resolve(blob))
        } catch {
          finish(() => reject(new TaskExecutionError('IMAGE_DOWNLOAD_FAILED', '无法读取生成图片')))
        }
        return
      }
      if (Date.now() - started >= timeoutMs) {
        finish(() => reject(new TaskExecutionError('GENERATION_TIMEOUT', '等待图片生成超时')))
      }
    }
    const observer = new MutationObserver(() => void check())
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    const interval = window.setInterval(() => void check(), 2000)
    void check()
  })
}


chrome.runtime.onMessage.addListener((message: { type?: string; task?: { id: string; prompt: string } }, _sender, sendResponse) => {
  if (message.type !== 'execute-task' || !message.task) return false
  void executeTask(message.task, adapter, waitForCompletedImage)
    .then(async (image) => sendResponse({ ok: true, bytes: await image.arrayBuffer(), mimeType: image.type || 'image/png', chatUrl: location.href }))
    .catch((error: TaskExecutionError) => sendResponse({ ok: false, code: error.code ?? 'PAGE_UNSUPPORTED', error: error.message }))
  return true
})

import { AlertCircle, Check, CloudOff, LoaderCircle, RotateCcw } from 'lucide-react'

import { useAppStore } from '../app/store'


export function SaveStatus({ onRetry }: { onRetry: () => void }) {
  const status = useAppStore((state) => state.saveStatus)
  const error = useAppStore((state) => state.error)
  const labels = { idle: '本地工作区', loading: '正在加载', saving: '正在保存', saved: '已保存', error: '保存失败', offline: '后端离线' }
  const Icon = status === 'error' ? AlertCircle : status === 'offline' ? CloudOff : status === 'saved' ? Check : LoaderCircle
  return (
    <div className={`save-status save-status--${status}`} role="status" title={error ?? labels[status]}>
      <Icon size={12} className={status === 'loading' || status === 'saving' ? 'status-spinner' : ''} />
      <span>{labels[status]}</span>
      {(status === 'error' || status === 'offline') && (
        <button type="button" aria-label="重新加载" onClick={onRetry}><RotateCcw size={11} /></button>
      )}
    </div>
  )
}

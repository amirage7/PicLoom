import { Image, Info, Tags } from 'lucide-react'


export function InspectorPanel() {
  return (
    <aside className="inspector-panel" aria-label="图片详情">
      <header className="inspector-header">
        <h2>图片详情</h2>
      </header>

      <div className="inspector-empty">
        <div className="inspector-preview"><Image size={28} strokeWidth={1.4} /></div>
        <h3>未选择图片</h3>
        <p>选择画布中的图片后，可在这里查看 Prompt、标签、创建时间和版本关系。</p>
      </div>

      <div className="inspector-skeleton" aria-hidden="true">
        <div className="skeleton-section">
          <span><Info size={14} /> 基本信息</span>
          <div className="skeleton-line skeleton-line--wide" />
          <div className="skeleton-line" />
        </div>
        <div className="skeleton-section">
          <span><Tags size={14} /> 标签</span>
          <div className="skeleton-tags"><i /><i /><i /></div>
        </div>
      </div>
    </aside>
  )
}

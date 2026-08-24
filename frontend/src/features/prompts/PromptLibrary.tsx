import { Copy, Library, Plus } from 'lucide-react'

import { useAppStore } from '../../app/store'
import { IconButton } from '../../components/IconButton'


export function PromptLibrary() {
  const prompts = useAppStore((state) => state.prompts)

  return (
    <section className="sidebar-section prompt-section" aria-labelledby="prompts-heading">
      <div className="section-heading-row">
        <h2 id="prompts-heading">Prompt Library</h2>
        <IconButton label="新建 Prompt 将在 Phase 3 开放" disabled>
          <Plus size={15} />
        </IconButton>
      </div>

      <div className="prompt-list">
        {prompts.map((prompt) => (
          <article className="prompt-row" key={prompt.id}>
            <span className="prompt-icon"><Library size={14} /></span>
            <span className="prompt-copy">
              <span className="prompt-title">{prompt.title}</span>
              <span className="prompt-category">{prompt.category}</span>
            </span>
            <IconButton label={`复制 ${prompt.title} 将在 Phase 3 开放`} disabled>
              <Copy size={13} />
            </IconButton>
          </article>
        ))}
      </div>
    </section>
  )
}

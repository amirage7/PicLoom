import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, Copy, FileImage, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { IconButton } from '../../../components/IconButton'
import type { CanvasNode } from '../../../types/domain'
import { useCanvasStore } from '../store/canvasStore'


function formatCreatedTime(createdTime: string) {
  return `${createdTime.slice(0, 10).replaceAll('-', '/')} ${createdTime.slice(11, 16)}`
}

export function ImageNode({ data, selected }: NodeProps<CanvasNode>) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const duplicateNode = useCanvasStore((state) => state.duplicateNode)
  const deleteNode = useCanvasStore((state) => state.deleteNode)
  const { image } = data

  const duplicatePersistedNode = useCanvasStore((state) => state.duplicatePersistedNode)
  const deletePersistedNode = useCanvasStore((state) => state.deletePersistedNode)
  return (
    <article className={`image-node ${selected ? 'image-node--selected' : ''}`}>
      <Handle
        type="target"
        position={Position.Left}
        className="image-node-handle image-node-handle--target"
        aria-label="父版本连接点"
      />

      <div className="image-node-preview">
        {imageFailed ? (
          <div className="image-node-fallback" role="img" aria-label={`${image.fileName} 加载失败`}>
            <FileImage size={24} />
            <span>{image.fileName}</span>
          </div>
        ) : (
          <img src={image.imageUrl} alt={image.fileName} onError={() => setImageFailed(true)} />
        )}

        <div className="image-node-actions nodrag">
          {confirmingDelete ? (
            <>
              <span>确认删除？</span>
              <IconButton label="确认删除" onClick={() => image.imageSource === 'stored' ? void deletePersistedNode(image.projectId, image.id) : deleteNode(image.projectId, image.id)}>
                <Check size={13} />
              </IconButton>
              <IconButton label="取消删除" onClick={() => setConfirmingDelete(false)}>
                <X size={13} />
              </IconButton>
            </>
          ) : (
            <>
              <IconButton label="复制节点" onClick={() => image.imageSource === 'stored' ? void duplicatePersistedNode(image.projectId, image.id) : duplicateNode(image.projectId, image.id)}>
                <Copy size={13} />
              </IconButton>
              <IconButton label="删除节点" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={13} />
              </IconButton>
            </>
          )}
        </div>
      </div>

      <div className="image-node-copy">
        <strong className="image-node-name" title={image.name}>{image.name}</strong>
        <p className="image-node-prompt" title={image.prompt}>{image.prompt}</p>
        <time dateTime={image.createdTime}>{formatCreatedTime(image.createdTime)}</time>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="image-node-handle image-node-handle--source"
        aria-label="子版本连接点"
      />
    </article>
  )
}

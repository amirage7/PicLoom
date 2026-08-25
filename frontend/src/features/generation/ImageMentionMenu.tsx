import type { MentionImage } from './imageMentions'

interface ImageMentionMenuProps {
  images: MentionImage[]
  activeIndex: number
  onSelect(image: MentionImage): void
}

export function ImageMentionMenu({ images, activeIndex, onSelect }: ImageMentionMenuProps) {
  return (
    <div className="image-mention-menu" role="listbox" aria-label="选择引用图片">
      {images.map((image, index) => (
        <button
          key={image.imageId}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(image)}
        >
          <img src={image.imageUrl} alt="" />
          <span><strong>{image.name}</strong><small>插入 @{image.name}</small></span>
        </button>
      ))}
    </div>
  )
}
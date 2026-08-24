import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  isActive?: boolean
}

export function IconButton({ label, children, isActive = false, className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive || undefined}
      className={`icon-button ${isActive ? 'icon-button--active' : ''} ${className}`}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
}

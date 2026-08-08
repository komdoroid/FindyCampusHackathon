import type { ReactNode } from 'react'

export function Modal({
  children,
  onClose,
  size,
}: {
  children: ReactNode
  onClose: () => void
  size: 'compact' | 'large'
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal-card modal-${size}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="閉じる">
          ×
        </button>
        {children}
      </div>
    </div>
  )
}

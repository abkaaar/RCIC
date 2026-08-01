/** JoinModal — pick display name/color before entering a room. */
import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { randomName, USER_COLORS, type PeerUser } from '@rcic/shared'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?'
}

export function JoinModal(props: { onJoin(user: PeerUser): void; onCancel(): void }) {
  const [name, setName] = useState(randomName())
  const [color, setColor] = useState(USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onCancel])

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="floating-panel modal" role="dialog" aria-modal="true" aria-label="Join this board">
        <div className="modal-header">
          <h2>Join this board</h2>
          <button type="button" className="icon-btn" title="Cancel" aria-label="Cancel" onClick={props.onCancel}>
            <X size={18} />
          </button>
        </div>
        <label className="modal-label">Your name</label>
        <input
          className="modal-input"
          value={name}
          autoFocus
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) props.onJoin({ name: name.trim(), color })
          }}
        />
        <label className="modal-label">Cursor color</label>
        <div className="join-color-preview">
          <div className="avatar" style={{ background: color }}>
            {initials(name.trim() || 'You')}
          </div>
          <div className="join-cursor-preview" aria-hidden>
            <svg width="18" height="22" viewBox="0 0 18 22">
              <path fill={color} stroke="#fff" strokeWidth="1.2" d="M2 2 L2 18 L7 13 L11 20 L13.5 19 L9.5 12 L16 12 Z" />
            </svg>
            <span style={{ color }}>{name.trim() || 'You'}</span>
          </div>
        </div>
        <div className="color-row modal-colors">
          {USER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-dot ${color === c ? 'color-dot-active color-dot-accent' : ''}`}
              style={{ background: c }}
              aria-label={`Cursor color ${c}`}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <button
          type="button"
          className="primary-btn"
          disabled={!name.trim()}
          onClick={() => props.onJoin({ name: name.trim(), color })}
        >
          Start collaborating
        </button>
      </div>
    </div>
  )
}

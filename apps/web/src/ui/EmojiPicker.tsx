/**
 * EmojiPicker — compact sticker grid above the toolbar + button (ISS-036).
 */
import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂',
  '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘',
  '😋', '😜', '🤪', '🤨', '🧐', '😎', '🥳', '😏',
  '😒', '🙄', '😬', '😔', '😢', '😭', '😤', '😡',
  '🤯', '😱', '🤠', '🤡', '👻', '💀', '👽', '🤖',
  '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤞', '🤟',
  '👋', '💪', '🔥', '✨', '⭐', '💯', '❤️', '🧡',
  '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💡',
  '🎉', '🎊', '🎈', '🎁', '🏆', '🎯', '🚀', '⚡',
  '✅', '❌', '⚠️', '📌', '📎', '💬', '💭', '👀',
]

export function EmojiPicker(props: {
  physicsOn: boolean
  onPick(emoji: string): void
  onTogglePhysics(): void
  onClose(): void
}) {
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return EMOJIS
    // Simple filter: keep all if query empty; emoji itself match only (no names DB)
    return EMOJIS.filter((e) => e.includes(needle) || needle.length === 0)
  }, [q])

  return (
    <div className="floating-panel emoji-picker" role="dialog" aria-label="Stickers">
      <div className="emoji-picker-header">
        <label className="emoji-search">
          <Search size={14} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search emoji"
            autoFocus
          />
        </label>
        <button type="button" className="icon-btn" title="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="emoji-grid">
        {list.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="emoji-cell"
            title={emoji}
            onClick={() => props.onPick(emoji)}
          >
            {emoji}
          </button>
        ))}
        {list.length === 0 && <div className="emoji-empty">No matches</div>}
      </div>
      <div className="emoji-picker-footer">
        <button type="button" className="dropdown-item" onClick={props.onTogglePhysics}>
          Physics: <strong>{props.physicsOn ? 'on' : 'off'}</strong>
        </button>
        <div className="flyout-hint">RC-board physics: flick to throw. Select for Pull or Push.</div>
      </div>
    </div>
  )
}

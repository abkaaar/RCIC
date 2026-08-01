/**
 * BoardTabStrip — in-app tabs; closing removes the tab only, not the server room.
 */
import { X } from 'lucide-react'
import type { BoardTab } from '../boardTabs'

export function BoardTabStrip(props: {
  tabs: BoardTab[]
  activeRoomId: string | null
  onSelect(roomId: string): void
  onClose(roomId: string): void
}) {
  if (props.tabs.length === 0) return null

  return (
    <div className="board-tab-strip" role="tablist" aria-label="Open boards">
      {props.tabs.map((t) => {
        const active = t.roomId === props.activeRoomId
        return (
          <div
            key={t.roomId}
            role="tab"
            aria-selected={active}
            className={`board-tab ${active ? 'board-tab-active' : ''}`}
            onClick={() => props.onSelect(t.roomId)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                props.onClose(t.roomId)
              }
            }}
          >
            <span className="board-tab-label" title={t.name}>
              {t.name || 'Untitled board'}
            </span>
            <button
              className="board-tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                props.onClose(t.roomId)
              }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

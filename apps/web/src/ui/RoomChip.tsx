/** RoomChip — current room label + copy-link / open-board helpers. */
import { useState } from 'react'
import { Check, Link, Plus } from 'lucide-react'
import { createRoomId } from '../api'
import type { ConnState } from './types'

const STATUS: Record<ConnState, { label: string; className: string }> = {
  connecting: { label: 'Syncing', className: 'badge-syncing' },
  live: { label: 'Live', className: 'badge-live' },
  offline: { label: 'Offline', className: 'badge-offline' },
}

export function RoomChip(props: {
  name: string
  conn: ConnState
  onRename(name: string): void
  /** App updates tab strip then navigates (or opens a browser tab). */
  onCreateBoard?(roomId: string, newBrowserTab: boolean): void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.name)
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const st = STATUS[props.conn]

  const commit = () => {
    setEditing(false)
    const v = draft.trim()
    if (v && v !== props.name) props.onRename(v)
  }

  /** Default: same window tab. Shift+click: new browser tab. */
  const createNewBoard = async (e: React.MouseEvent) => {
    if (creating || !props.onCreateBoard) return
    setCreating(true)
    try {
      const roomId = await createRoomId()
      props.onCreateBoard(roomId, e.shiftKey)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="floating-panel room-chip">
      <div className="chip-logo" aria-hidden>
        C
      </div>
      {editing ? (
        <input
          className="chip-name-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          className="chip-name"
          title="Rename board"
          onClick={() => {
            setDraft(props.name)
            setEditing(true)
          }}
        >
          {props.name}
        </button>
      )}
      <span className={`badge ${st.className}`}>{st.label}</span>
      <button
        className="icon-btn"
        title="New board (Shift+click = new browser tab)"
        disabled={creating || !props.onCreateBoard}
        onClick={(e) => void createNewBoard(e)}
      >
        <Plus size={15} />
      </button>
      <button
        className="icon-btn"
        title="Copy invite link"
        onClick={() => {
          void navigator.clipboard.writeText(location.href)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <Check size={15} /> : <Link size={15} />}
      </button>
    </div>
  )
}

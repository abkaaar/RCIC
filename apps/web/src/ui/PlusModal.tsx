/**
 * PlusModal — tabbed stickers / insert / templates / voting / reactions (ISS-042).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  LayoutTemplate,
  Search,
  Table2,
  Vote,
  X,
} from 'lucide-react'
import iconChart from '../assets/icons/tool-chart.png'
import iconCode from '../assets/icons/tool-code.png'
import iconFlowchart from '../assets/icons/tool-flowchart.png'

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

const REACTIONS = ['👍', '❤️', '🎉', '👏', '😂', '👀', '🚀'] as const

type Tab = 'stickers' | 'insert' | 'templates' | 'voting' | 'reactions'

export function PlusModal(props: {
  physicsOn: boolean
  isOwner: boolean
  votingActive: boolean
  onPickSticker(emoji: string): void
  onTogglePhysics(): void
  onInsert(kind: 'code' | 'poll' | 'table' | 'chart'): void
  onTemplate(kind: 'brainstorm' | 'flowchart'): void
  onVotingStart(): void
  onVotingStop(): void
  onVotingReset(): void
  onReaction(emoji: string): void
  onClose(): void
}) {
  const [tab, setTab] = useState<Tab>('stickers')
  const [q, setQ] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [props.onClose])

  // Focus search without scrolling the page (avoids jump-to-center).
  useEffect(() => {
    if (tab !== 'stickers') return
    const id = window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(id)
  }, [tab])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return EMOJIS
    return EMOJIS.filter((e) => e.includes(needle))
  }, [q])

  return (
    <div className="floating-panel plus-modal" role="dialog" aria-label="More tools">
      <div className="plus-modal-header">
        <div className="plus-tabs">
          {(
            [
              ['stickers', 'Stickers'],
              ['insert', 'Insert'],
              ['templates', 'Templates'],
              ['voting', 'Voting'],
              ['reactions', 'Reactions'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`plus-tab ${tab === id ? 'plus-tab-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" title="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </div>

      <div className="plus-modal-body">
        {tab === 'stickers' && (
          <>
            <label className="emoji-search">
              <Search size={14} />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search emoji"
              />
            </label>
            <div className="emoji-grid">
              {list.map((emoji) => (
                <button key={emoji} type="button" className="emoji-cell" title={emoji} onClick={() => props.onPickSticker(emoji)}>
                  {emoji}
                </button>
              ))}
              {list.length === 0 && <div className="emoji-empty">No matches</div>}
            </div>
            <div className="emoji-picker-footer">
              <button type="button" className="dropdown-item" onClick={props.onTogglePhysics}>
                Physics: <strong>{props.physicsOn ? 'on' : 'off'}</strong>
              </button>
              <div className="flyout-hint">Throw objects with a flick. Select an object to make it attract or repel.</div>
            </div>
          </>
        )}

        {tab === 'insert' && (
          <div className="plus-insert-grid">
            <button type="button" className="plus-insert-btn" onClick={() => props.onInsert('code')}>
              <img src={iconCode} alt="" className="tool-icon-img" draggable={false} />
              <span>Code snippet</span>
            </button>
            <button type="button" className="plus-insert-btn" onClick={() => props.onInsert('poll')}>
              <Vote size={18} />
              <span>Poll</span>
            </button>
            <button type="button" className="plus-insert-btn" onClick={() => props.onInsert('table')}>
              <Table2 size={18} />
              <span>Table</span>
            </button>
            <button type="button" className="plus-insert-btn" onClick={() => props.onInsert('chart')}>
              <img src={iconChart} alt="" className="tool-icon-img" draggable={false} />
              <span>Chart</span>
            </button>
          </div>
        )}

        {tab === 'templates' && (
          <div className="plus-insert-grid">
            <button type="button" className="plus-insert-btn" onClick={() => props.onTemplate('brainstorm')}>
              <LayoutTemplate size={18} />
              <span>Brainstorming Board</span>
            </button>
            <button type="button" className="plus-insert-btn" onClick={() => props.onTemplate('flowchart')}>
              <img src={iconFlowchart} alt="" className="tool-icon-img" draggable={false} />
              <span>Flowchart Template</span>
            </button>
          </div>
        )}

        {tab === 'voting' && (
          <div className="plus-session">
            <div className="plus-session-block">
              <div className="plus-session-title">Live voting</div>
              <div className="flyout-hint">
                {props.votingActive
                  ? 'Voting is active — click objects on the board to vote.'
                  : 'Start a session so everyone can vote on objects.'}
              </div>
              {props.isOwner ? (
                <div className="plus-session-actions">
                  {!props.votingActive ? (
                    <button type="button" className="share-btn" onClick={props.onVotingStart}>
                      Start voting
                    </button>
                  ) : (
                    <button type="button" className="tool-btn" onClick={props.onVotingStop}>
                      Stop
                    </button>
                  )}
                  <button type="button" className="tool-btn" onClick={props.onVotingReset}>
                    Reset votes
                  </button>
                </div>
              ) : (
                <div className="flyout-hint">Only the board owner can start or stop voting.</div>
              )}
            </div>
          </div>
        )}

        {tab === 'reactions' && (
          <div className="plus-session">
            <div className="plus-session-block">
              <div className="plus-session-title">Quick reactions</div>
              <div className="flyout-hint">Send a reaction near your cursor — it fades after a moment.</div>
              <div className="plus-reactions">
                {REACTIONS.map((emoji) => (
                  <button key={emoji} type="button" className="emoji-cell" onClick={() => props.onReaction(emoji)}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
